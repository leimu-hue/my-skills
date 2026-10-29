import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/host/skills/service.js'
import { loadState } from '../dist/host/skills/state.js'
import { loadMcp, patchPathOf } from '../dist/host/mcp/service.js'
import { createPromptSource, loadPrompts, savePreset } from '../dist/host/prompts/service.js'
import {
  adoptPendingScene,
  deleteScene,
  effectiveSceneOf,
  loadScenes,
  reconcileSessionLayers,
  saveScene,
  setSessionScene,
  setWorkspaceScene,
  workspaceSceneOf,
} from '../dist/host/scenes/service.js'
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
  const workspace = join(base, 'repo')
  const other = join(base, 'other')
  await mkdir(workspace, { recursive: true })
  await mkdir(other, { recursive: true })
  const service = createService({ dshHome, agentsHome: join(base, 'agents'), log: () => {} })
  return { base, dshHome, service, workspace, other }
}

/** 某个作用域视角下每条技能的开关。 */
async function onOf(service, cwd, scopeKey) {
  const view = await service.view(cwd, scopeKey)
  const map = new Map()
  for (const row of allRows(view)) map.set(row.declaredName, row.policy.skillOn)
  return map
}

test('a scene is a reusable definition: no workspace field, and several workspaces may choose it', async () => {
  const { dshHome, service, workspace, other } = await fixture()
  const saved = await saveScene(dshHome, { name: '写作', description: '只要两条', skills: [{ root: 'local', name: 'alpha' }] })
  assert.equal('workspace' in saved, false, 'a scene no longer carries a workspace binding')

  await setWorkspaceScene(dshHome, service, workspace, '写作')
  await setWorkspaceScene(dshHome, service, other, '写作')

  const state = await loadScenes(dshHome)
  assert.equal(state.active[workspace], '写作')
  assert.equal(state.active[other], '写作', 'the same scene can be chosen by several workspaces')
  assert.equal((await onOf(service, workspace)).get('beta'), false)
  assert.equal((await onOf(service, other)).get('beta'), false)
})

test('a workspace that does not choose the scene is untouched, and so is the global policy', async () => {
  const { dshHome, service, workspace, other } = await fixture()
  await saveScene(dshHome, { name: 'only-alpha', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'only-alpha')

  const outside = await onOf(service, other)
  assert.equal(outside.get('alpha'), true)
  assert.equal(outside.get('beta'), true, 'another workspace keeps everything')
  assert.equal((await onOf(service)).get('beta'), true, 'the global policy is never rewritten')
  const state = (await loadState(join(dshHome, 'tool-center', 'state.json'))).state
  assert.deepEqual(state.hiddenSkills, {}, 'no global hiding is written')
})

test('clearing a workspace scene removes its layer and leaves the global policy alone', async () => {
  const { dshHome, service, workspace } = await fixture()
  await service.setSkill('local', 'gamma', false)
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  assert.equal((await onOf(service, workspace)).get('gamma'), false)

  let invalidated = 0
  service.invalidators.add(() => { invalidated += 1 })
  const report = await setWorkspaceScene(dshHome, service, workspace, null)
  assert.equal(report.scene, null)
  assert.ok(invalidated > 0, 'clearing must invalidate the catalog')

  const after = await onOf(service, workspace)
  assert.equal(after.get('beta'), true)
  assert.equal(after.get('gamma'), false, 'the user global choice survives')
  assert.deepEqual((await loadState(join(dshHome, 'tool-center', 'state.json'))).state.layers.workspaces, {})
  assert.deepEqual((await loadScenes(dshHome)).active, {})
})

test('switching scenes in one workspace replaces the layer and reports what it replaced', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await saveScene(dshHome, { name: 'b', skills: [{ root: 'local', name: 'beta' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  const report = await setWorkspaceScene(dshHome, service, workspace, 'b')
  assert.equal(report.replaced, 'a')
  const state = await onOf(service, workspace)
  assert.equal(state.get('beta'), true)
  assert.equal(state.get('alpha'), false)
})

test('the whole switch is a rule, not a snapshot: skills added later stay outside the scene', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-alpha', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'only-alpha')

  const layer = (await loadState(join(dshHome, 'tool-center', 'state.json'))).state.layers.workspaces[workspace]
  assert.equal(layer.whitelist, true)
  assert.equal(layer.hiddenSkills, undefined, 'no per-name snapshot is written')

  await mkdir(join(dshHome, 'skills', 'delta'), { recursive: true })
  await writeFile(join(dshHome, 'skills', 'delta', 'SKILL.md'), '---\nname: delta\ndescription: delta skill\n---\nbody\n')
  const delta = allRows(await service.view(workspace)).find((row) => row.declaredName === 'delta')
  assert.equal(delta.policy.skillOn, false, 'a newly installed skill is not silently inside the scene')
})

test('a non-exclusive scene only enables what it lists', async () => {
  const { dshHome, service, workspace } = await fixture()
  await service.setSkill('local', 'gamma', false)
  await saveScene(dshHome, { name: 'add-alpha', skills: [{ root: 'local', name: 'alpha' }], exclusive: false })
  await setWorkspaceScene(dshHome, service, workspace, 'add-alpha')

  const inside = await onOf(service, workspace)
  assert.equal(inside.get('alpha'), true)
  assert.equal(inside.get('beta'), true, 'untouched by a non-exclusive scene')
  assert.equal(inside.get('gamma'), false, 'the user global choice still applies')
})

test('a session can pick its own scene, and it overrides the workspace default', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await saveScene(dshHome, { name: 'b', skills: [{ root: 'local', name: 'beta' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')

  await setSessionScene(dshHome, service, 'session-1', workspace, 'b')
  assert.equal((await onOf(service, workspace, 'ss:session-1')).get('beta'), true)
  assert.equal((await onOf(service, workspace, 'ss:session-1')).get('alpha'), false)
  assert.equal((await onOf(service, workspace)).get('alpha'), true, 'the workspace default is unchanged')

  const state = await loadScenes(dshHome)
  assert.deepEqual(effectiveSceneOf(state, workspace, 'session-1'), { name: 'b', source: 'session' })
  assert.deepEqual(effectiveSceneOf(state, workspace, 'session-2'), { name: 'a', source: 'workspace' })
})

test('a session can switch the scene off without touching the workspace default', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  await setSessionScene(dshHome, service, 'session-off', workspace, null)

  const inside = await onOf(service, workspace, 'ss:session-off')
  assert.equal(inside.get('alpha'), false, 'the session sees nothing of the scene')
  assert.equal(inside.get('beta'), false, 'and nothing else either')
  assert.equal((await onOf(service, workspace)).get('alpha'), true, 'the workspace still uses the scene')

  const state = await loadScenes(dshHome)
  assert.deepEqual(effectiveSceneOf(state, workspace, 'session-off'), { name: null, source: 'session' })
})

test('following the workspace again drops the session choice', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  await setSessionScene(dshHome, service, 's-follow', workspace, null)
  await setSessionScene(dshHome, service, 's-follow', workspace, undefined)

  assert.equal((await loadScenes(dshHome)).sessions['s-follow'], undefined)
  const layer = (await loadState(join(dshHome, 'tool-center', 'state.json'))).state.layers.sessions['s-follow']
  assert.equal(layer, undefined, 'the session layer is gone too')
  assert.equal((await onOf(service, workspace, 'ss:s-follow')).get('alpha'), true, 'it follows the workspace again')
})

test('changing the workspace scene re-materializes following sessions and leaves overrides alone', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await saveScene(dshHome, { name: 'b', skills: [{ root: 'local', name: 'beta' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')

  // 明确选择 b 的会话：工作区换场景时它不该被改。
  await setSessionScene(dshHome, service, 'pinned', workspace, 'b')
  await setWorkspaceScene(dshHome, service, workspace, 'b')
  assert.equal((await onOf(service, workspace, 'ss:pinned')).get('beta'), true)
  assert.equal((await onOf(service, workspace, 'ss:pinned')).get('alpha'), false)

  // 「明确不用」的会话：工作区换场景后仍然什么都不用。
  await setSessionScene(dshHome, service, 'off', workspace, null)
  await reconcileSessionLayers(dshHome, service)
  assert.equal((await onOf(service, workspace, 'ss:off')).get('alpha'), false)
  assert.equal((await onOf(service, workspace, 'ss:off')).get('beta'), false)
})

test('a scene picked on the new-session page is adopted by the conversation that really starts', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-alpha', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })

  // 新会话页的 id 只是草稿：宿主在发送时才建真正的会话，这个 id 往往永远不会成为对话。
  const draft = 'session-draft-0001'
  const real = 'session-real-0002'
  await setSessionScene(dshHome, service, draft, workspace, 'only-alpha', { carryOver: true })
  assert.equal((await loadScenes(dshHome)).pending[workspace]?.scene, 'only-alpha')
  assert.equal((await onOf(service, workspace, `ss:${real}`)).get('beta'), true, '认领之前，这个会话还是常态')

  const report = await adoptPendingScene(dshHome, service, real, workspace)
  assert.equal(report.adopted, 'only-alpha')
  assert.equal((await onOf(service, workspace, `ss:${real}`)).get('alpha'), true)
  assert.equal((await onOf(service, workspace, `ss:${real}`)).get('beta'), false, '整套切换在这个会话里生效了')

  const state = await loadScenes(dshHome)
  assert.equal(state.sessions[real]?.scene, 'only-alpha')
  assert.equal(state.pending[workspace], undefined, '这条意图被消费掉（不会再去管下一场）')
  assert.equal(state.sessions[draft], undefined, '草稿 id 上的残留记录也被清掉')
  const layers = (await loadState(join(dshHome, 'tool-center', 'state.json'))).state.layers.sessions
  assert.equal(layers[draft], undefined, '草稿 id 的技能层也一起清掉，状态文件不会越攒越大')
})

test('adoption never overrides a choice the session made itself', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setSessionScene(dshHome, service, 'draft', workspace, 'a', { carryOver: true })
  await setSessionScene(dshHome, service, 'real', workspace, null)

  const report = await adoptPendingScene(dshHome, service, 'real', workspace)
  assert.equal(report.changed, false, '/scene off 之后，开始会话时的那次选择不该反过来盖掉它')
  assert.equal((await onOf(service, workspace, 'ss:real')).get('alpha'), false)
})

test('an old pick expires instead of ruling later conversations', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setSessionScene(dshHome, service, 'draft', workspace, 'a', { carryOver: true })

  const file = join(dshHome, 'tool-center', 'scenes.json')
  const document = JSON.parse(await readFile(file, 'utf8'))
  document.pending[workspace].at = Date.now() - 31 * 60 * 1000
  await writeFile(file, JSON.stringify(document, null, 2))

  const report = await adoptPendingScene(dshHome, service, 'late', workspace)
  assert.equal(report.changed, false, '半小时前随手点的那一下不该管住今天的会话')
  assert.equal((await loadScenes(dshHome)).pending[workspace], undefined)
  assert.equal((await onOf(service, workspace, 'ss:late')).get('beta'), true)
})

test('a scene that only carries MCP servers leaves skills alone', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'mcp-only', skills: [], mcp: ['rea-mcp'], exclusive: false })
  await setSessionScene(dshHome, service, 'session-mcp', workspace, 'mcp-only')

  const on = await onOf(service, workspace, 'ss:session-mcp')
  assert.equal(on.get('alpha'), true, '技能留空的场景不该把整个会话的技能关掉')
  assert.equal(on.get('beta'), true)
  assert.equal((await effectiveSceneOf(await loadScenes(dshHome), workspace, 'session-mcp')).name, 'mcp-only')
})

test('a scene whose skills all vanished is reported instead of silently blocking', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'gone', skills: [{ root: 'local', name: 'no-such-skill' }], exclusive: false })
  const report = await setSessionScene(dshHome, service, 'session-gone', workspace, 'gone')
  assert.ok(report.warnings.some((line) => line.includes('找不到')), '要把「一条都没命中」说出来')
  assert.equal((await onOf(service, workspace, 'ss:session-gone')).get('beta'), true, '非整套切换：没命中就是没生效')

  await saveScene(dshHome, { name: 'gone-exclusive', skills: [{ root: 'local', name: 'no-such-skill' }], exclusive: true })
  const strict = await setSessionScene(dshHome, service, 'session-gone-2', workspace, 'gone-exclusive')
  assert.ok(strict.warnings.some((line) => line.includes('整套切换')), '整套切换 + 一条没命中 = 技能全被挡，必须警告')
})

test('a scene in use cannot be deleted', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [] })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  await assert.rejects(() => deleteScene(dshHome, 'a'), /正在工作区/)
})

test('a scene used by a session cannot be deleted either', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [] })
  await setSessionScene(dshHome, service, 's1', workspace, 'a')
  await assert.rejects(() => deleteScene(dshHome, 'a'), /正在使用/)
})

test('an unknown scene is refused', async () => {
  const { dshHome, service, workspace } = await fixture()
  await assert.rejects(() => setWorkspaceScene(dshHome, service, workspace, 'nope'), /场景不存在/)
  await assert.rejects(() => setSessionScene(dshHome, service, 's1', workspace, 'nope'), /场景不存在/)
})

test('a workspace-scoped preset is enabled by the scene and cleared again', async () => {
  const { dshHome, service, workspace } = await fixture()
  await savePreset(dshHome, 'ws-preset', '# 工作区指令\n', { kind: 'workspace', path: workspace })
  await saveScene(dshHome, { name: 'ws', prompt: 'ws-preset', skills: [], exclusive: false })
  await setWorkspaceScene(dshHome, service, workspace, 'ws')

  const source = createPromptSource(dshHome)
  await source.refresh()
  assert.equal(source.textFor(workspace), '# 工作区指令')
  const agentsFile = await stat(join(workspace, 'AGENTS.md')).then(() => true).catch(() => false)
  assert.equal(agentsFile, false, 'the preset is appended to the prompt, never written to AGENTS.md')

  await setWorkspaceScene(dshHome, service, workspace, null)
  await source.refresh()
  assert.equal(source.textFor(workspace), '', 'clearing the scene stops the append')
  assert.equal((await loadPrompts(dshHome)).applied.length, 0)
})

test('a global preset is skipped with a warning instead of leaking into every workspace', async () => {
  const { dshHome, service, workspace } = await fixture()
  await savePreset(dshHome, 'global-preset', '# 全局指令\n')
  await saveScene(dshHome, { name: 'g', prompt: 'global-preset', skills: [], exclusive: false })
  const report = await setWorkspaceScene(dshHome, service, workspace, 'g')

  assert.ok(report.warnings.some((warning) => warning.includes('不随工作区隔离')))
  assert.equal((await loadPrompts(dshHome)).applied.length, 0, 'nothing was enabled')
})

test('a session-level choice never changes the prompt, and says so', async () => {
  const { dshHome, service, workspace } = await fixture()
  await savePreset(dshHome, 'ws-preset', '# 工作区指令\n', { kind: 'workspace', path: workspace })
  await saveScene(dshHome, { name: 'ws', prompt: 'ws-preset', skills: [] })
  const report = await setSessionScene(dshHome, service, 's1', workspace, 'ws')

  assert.ok(report.warnings.some((warning) => warning.includes('不改变提示词')))
  assert.equal((await loadPrompts(dshHome)).applied.length, 0, 'the prompt is not applied by a session-level choice')
})

test('a missing skill in the allowlist is reported as "entered, but not everything"', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, {
    name: 'partly-real',
    skills: [{ root: 'local', name: 'alpha' }, { root: 'local', name: 'does-not-exist' }],
    exclusive: false,
  })
  const report = await setWorkspaceScene(dshHome, service, workspace, 'partly-real')
  assert.equal(report.applied.skills, 1)
  assert.ok(report.warnings.some((warning) => warning.includes('已经不在这个工作区')))
})

test('MCP references are checked against the host patch, and nothing is toggled', async () => {
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'keep-mcp', mcp: ['rea-mcp'], skills: [], exclusive: true })
  const report = await setWorkspaceScene(dshHome, service, workspace, 'keep-mcp')
  assert.equal((await loadMcp(dshHome)).servers[0].enabled, true, 'the server is never switched off by a scene')
  assert.equal(report.warnings.some((warning) => warning.includes('没有声明')), false)

  await saveScene(dshHome, { name: 'ghost', mcp: ['nope-mcp'], skills: [], exclusive: true })
  const ghost = await setWorkspaceScene(dshHome, service, workspace, 'ghost')
  assert.ok(ghost.warnings.some((warning) => warning.includes('没有声明')))
})

test('a v3 document (scene bound to a workspace) migrates into that workspace default', async () => {
  const { dshHome, workspace } = await fixture()
  await mkdir(join(dshHome, 'tool-center'), { recursive: true })
  await writeFile(join(dshHome, 'tool-center', 'scenes.json'), JSON.stringify({
    version: 3,
    scenes: [{ name: 'legacy', workspace, skills: [], mcp: [], prompt: null, exclusive: true }],
    active: {},
    applied: {},
  }))
  const state = await loadScenes(dshHome)
  assert.equal(state.active[workspace], 'legacy', 'the old binding becomes the workspace default')
})

test('the same workspace written with different casing stays one entry', async (t) => {
  if (process.platform !== 'win32') return t.skip('case-insensitive paths are a Windows trait')
  const { dshHome, service, workspace } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })

  await setWorkspaceScene(dshHome, service, workspace, 'a')
  const flipped = workspace.toUpperCase()
  const report = await setWorkspaceScene(dshHome, service, flipped, 'a')
  assert.equal(report.changed, false, 'a differently-cased path is the same workspace, not a second one')

  const state = await loadScenes(dshHome)
  assert.equal(Object.keys(state.active).length, 1, 'no duplicate workspace records')
  assert.equal(workspaceSceneOf(state, flipped), 'a', 'lookup works from either casing')
})
