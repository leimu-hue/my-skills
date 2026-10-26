import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/host/skills/service.js'
import { loadState } from '../dist/host/skills/state.js'
import { loadMcp, patchPathOf } from '../dist/host/mcp/service.js'
import { savePreset } from '../dist/host/prompts/service.js'
import { applyScene, deleteScene, exitScene, loadScenes, saveScene } from '../dist/host/scenes/service.js'
import { allRows } from '../dist/host/skills/view.js'

const MCP_PATCH = `- insert:
    - id: rea-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rea
        command: cmd.exe
`

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'sm-scene-'))
  const dshHome = join(base, 'dsh')
  for (const name of ['alpha', 'beta', 'gamma']) {
    await mkdir(join(dshHome, 'skills', name), { recursive: true })
    await writeFile(join(dshHome, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\nbody\n`)
  }
  await writeFile(patchPathOf(dshHome), MCP_PATCH)
  await savePreset(dshHome, 'p1', '# 场景一指令\n')
  const service = createService({ dshHome, agentsHome: join(base, 'agents'), log: () => {} })
  return { base, dshHome, service }
}

async function onOf(service) {
  const view = await service.view()
  const map = new Map()
  for (const row of allRows(view)) map.set(row.declaredName, row.policy.skillOn)
  return map
}

test('a scene stores an allowlist plus prompt target and can be re-saved', async () => {
  const { dshHome } = await fixture()
  const saved = await saveScene(dshHome, {
    name: '写作',
    description: '只要这两条',
    skills: [{ root: 'local', name: 'alpha' }],
    mcp: ['rea-mcp'],
    prompt: 'p1',
    promptTarget: { scope: 'workspace', workspace: 'D:\\repo' },
    exclusive: true,
  })
  assert.equal(saved.exclusive, true)
  assert.deepEqual(saved.promptTarget, { scope: 'workspace', workspace: 'D:\\repo' })

  const listed = await loadScenes(dshHome)
  assert.equal(listed.scenes.length, 1)
  assert.deepEqual(listed.scenes[0].skills, [{ root: 'local', name: 'alpha' }])

  await saveScene(dshHome, { name: '写作', description: '改过' })
  const again = await loadScenes(dshHome)
  assert.equal(again.scenes.length, 1, 'same name updates instead of duplicating')
  assert.equal(again.scenes[0].description, '改过')
  assert.deepEqual(again.scenes[0].skills, [{ root: 'local', name: 'alpha' }], 'unspecified fields are kept')
  assert.equal(again.scenes[0].exclusive, true, 'exclusive defaults to true and is kept')
})

test('applying an exclusive scene enables exactly the allowlist and disables the rest', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, {
    name: 'only-alpha',
    skills: [{ root: 'local', name: 'alpha' }],
    mcp: [],
    prompt: null,
    exclusive: true,
  })
  const report = await applyScene(dshHome, service, undefined, 'only-alpha')
  const state = await onOf(service)
  assert.equal(state.get('alpha'), true, 'the selected skill is on')
  assert.equal(state.get('beta'), false, 'the others are switched off')
  assert.equal(state.get('gamma'), false)
  assert.equal(report.applied.skills, 2, 'beta and gamma were changed; alpha was already on')
})

test('a non-exclusive scene only enables what it lists', async () => {
  const { dshHome, service } = await fixture()
  await service.setSkill('local', 'gamma', false)
  await saveScene(dshHome, {
    name: 'add-alpha',
    skills: [{ root: 'local', name: 'alpha' }],
    mcp: [],
    prompt: null,
    exclusive: false,
  })
  await applyScene(dshHome, service, undefined, 'add-alpha')
  const state = await onOf(service)
  assert.equal(state.get('alpha'), true)
  assert.equal(state.get('beta'), true, 'untouched by a non-exclusive scene')
  assert.equal(state.get('gamma'), false, 'the user own choice survives')
})

test('an exclusive scene that lists no server switches it off, and exit brings it back', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'no-mcp', mcp: [], skills: [], prompt: null, exclusive: true })
  await applyScene(dshHome, service, undefined, 'no-mcp')
  assert.equal((await loadMcp(dshHome)).servers[0].enabled, false, 'exclusive: unlisted server is off')
  await exitScene(dshHome, service)
  assert.equal((await loadMcp(dshHome)).servers[0].enabled, true, 'exit restores it')
})

test('a listed server stays enabled across an exclusive apply', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'keep-mcp', mcp: ['rea-mcp'], skills: [], prompt: null, exclusive: true })
  await applyScene(dshHome, service, undefined, 'keep-mcp')
  assert.equal((await loadMcp(dshHome)).servers[0].enabled, true)
})

test('switching scenes rolls the previous scene back and rolls the new one forward', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], mcp: [], prompt: 'p1', exclusive: true })
  await saveScene(dshHome, { name: 'b', skills: [{ root: 'local', name: 'beta' }], mcp: [], prompt: null, exclusive: true })

  await applyScene(dshHome, service, undefined, 'a')
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 场景一指令\n')

  const report = await applyScene(dshHome, service, undefined, 'b')
  const state = await onOf(service)
  assert.equal(state.get('beta'), true)
  assert.equal(state.get('alpha'), false, 'b does not list alpha, so exclusive turns it off')
  assert.equal(report.reverted.prompt, true, 'the prompt applied by a is rolled back')
  const agentsExists = await stat(join(dshHome, 'AGENTS.md')).then(() => true).catch(() => false)
  assert.equal(agentsExists, false, 'a preset applied by the previous scene is removed, not left behind')
  assert.equal((await loadScenes(dshHome)).active, 'b')
})

test('exit restores the exact pre-scene state, including a skill the user had already turned off', async () => {
  const { dshHome, service } = await fixture()
  await service.setSkill('local', 'gamma', false)   // 用户手工关掉的
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await applyScene(dshHome, service, undefined, 'a')
  assert.equal((await onOf(service)).get('gamma'), false)

  let invalidated = 0
  service.invalidators.add(() => { invalidated += 1 })
  await exitScene(dshHome, service)
  assert.ok(invalidated > 0, 'rolling a scene back must invalidate the skills catalog (the model view)')

  const state = await onOf(service)
  assert.equal(state.get('alpha'), true)
  assert.equal(state.get('beta'), true)
  assert.equal(state.get('gamma'), false, 'the user own choice is restored, not lost')
  const hidden = (await loadState(join(dshHome, 'tool-center', 'state.json'))).state.hiddenSkills
  assert.deepEqual(hidden.local, ['gamma'])
})

test('the active scene cannot be deleted', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }] })
  await applyScene(dshHome, service, undefined, 'a')
  await assert.rejects(() => deleteScene(dshHome, 'a'), /正在生效/)
})

test('re-applying the same scene is harmless', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await applyScene(dshHome, service, undefined, 'a')
  const second = await applyScene(dshHome, service, undefined, 'a')
  assert.equal(second.changed, false, 'nothing left to change')
  assert.equal(second.reverted.skills, 0, 'applying the same scene does not roll itself back')
  assert.equal((await onOf(service)).get('alpha'), true)
})

test('an unknown scene is refused', async () => {
  const { dshHome, service } = await fixture()
  await assert.rejects(() => applyScene(dshHome, service, undefined, 'nope'), /场景不存在/)
})

test('a scene applies a preset that is bound to a workspace, and only that project gets it', async () => {
  const { base, dshHome, service } = await fixture()
  const workspace = join(base, 'repo')
  await mkdir(workspace, { recursive: true })
  // 作用范围属于预设本身（v3）：先建一份绑到工作区的预设，场景只引用它。
  await savePreset(dshHome, 'ws-preset', '# 场景一指令\n', { kind: 'workspace', path: workspace })
  await saveScene(dshHome, { name: 'ws', skills: [{ root: 'local', name: 'alpha' }], prompt: 'ws-preset', exclusive: false })
  await applyScene(dshHome, service, undefined, 'ws')
  assert.equal(await readFile(join(workspace, 'AGENTS.md'), 'utf8'), '# 场景一指令\n')
  const globalExists = await stat(join(dshHome, 'AGENTS.md')).then(() => true).catch(() => false)
  assert.equal(globalExists, false, 'the global AGENTS.md is not touched')
})

test('a missing preset is reported as a warning, not a thrown error', async () => {
  const { dshHome, service } = await fixture()
  await saveScene(dshHome, { name: 'a', prompt: 'gone', exclusive: false })
  const report = await applyScene(dshHome, service, undefined, 'a')
  assert.ok(report.warnings.some((warning) => warning.includes('应用提示词')))
})
