import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/host/skills/service.js'
import { loadScenes, saveScene, setWorkspaceScene } from '../dist/host/scenes/service.js'
import { createSceneCommand, sessionOf, workspaceOf } from '../dist/host/commands/scene.js'
import { allRows } from '../dist/host/skills/view.js'

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'sm-cmd-'))
  const dshHome = join(base, 'dsh')
  for (const name of ['alpha', 'beta']) {
    await mkdir(join(dshHome, 'skills', name), { recursive: true })
    await writeFile(join(dshHome, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\nbody\n`)
  }
  const workspace = join(base, 'repo')
  await mkdir(workspace, { recursive: true })
  const service = createService({ dshHome, agentsHome: join(base, 'agents'), log: () => {} })
  const command = createSceneCommand({ dshHome, service })
  return { base, dshHome, service, workspace, command }
}

/** 宿主交给 handler 的 invocation 里只要 agent / rawInput 两项有用。 */
const exec = (sessionId, workspace, rawInput = '', extra = {}) => ({
  agent: { session: { id: sessionId, header: { cwd: workspace, ...extra } } },
  rawInput,
})

const onOf = async (service, workspace, scope) => {
  const view = await service.view(workspace, scope)
  const map = new Map()
  for (const row of allRows(view)) map.set(row.declaredName, row.policy.skillOn)
  return map
}

test('the command reads the workspace and session from the session header, with the legacy meta fallback', () => {
  assert.equal(workspaceOf({ agent: { session: { id: 's1', header: { cwd: 'D:\\repo' } } } }), 'D:\\repo')
  assert.equal(workspaceOf({ agent: { session: { id: 's2', meta: { cwd: 'D:\\legacy' } } } }), 'D:\\legacy')
  assert.equal(workspaceOf({ agent: {} }), '')
  assert.equal(sessionOf({ agent: { session: { id: 's3' } } }), 's3')
  assert.equal(sessionOf({ agent: {} }), null)
})

test('a session without a workspace is told why the scene cannot apply', async () => {
  const { command } = await fixture()
  const result = await command.handler({ agent: { session: { id: 'no-workspace-session' } }, rawInput: '' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /工作区/)
})

test('a session without an identity is refused instead of guessing', async () => {
  const { workspace, command } = await fixture()
  const result = await command.handler({ agent: { session: { header: { cwd: workspace } } }, rawInput: '' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /会话的身份/)
})

test('listing shows every scene plus which one this session effectively uses', async () => {
  const { dshHome, service, workspace, command } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }] })
  await saveScene(dshHome, { name: 'b', skills: [] })
  await setWorkspaceScene(dshHome, service, workspace, 'a')

  const result = await command.handler(exec('s-list', workspace, ''))
  assert.equal(result.kind, 'success')
  assert.match(result.text, /当前场景：a（跟随工作区默认）/)
  assert.match(result.text, /\[生效中\]/)
  assert.match(result.text, /- b/)
})

test('naming a scene gives it to this session, not to the workspace', async () => {
  const { dshHome, service, workspace, command } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await saveScene(dshHome, { name: 'b', skills: [{ root: 'local', name: 'beta' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')

  const result = await command.handler(exec('s-pick', workspace, 'b'))
  assert.equal(result.kind, 'success')
  assert.match(result.text, /本会话已使用「b」/)

  const mine = await onOf(service, workspace, 'ss:s-pick')
  assert.equal(mine.get('beta'), true)
  assert.equal(mine.get('alpha'), false)

  // 工作区默认还是 a，别的会话不受影响。
  assert.equal((await loadScenes(dshHome)).active[workspace], 'a')
  assert.equal((await onOf(service, workspace, 'ss:someone-else')).get('alpha'), true)
})

test('off means "this session uses none", and still leaves the workspace default alone', async () => {
  const { dshHome, service, workspace, command } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')

  const result = await command.handler(exec('s-off', workspace, 'off'))
  assert.equal(result.kind, 'success')
  assert.match(result.text, /本会话已不使用场景/)

  const mine = await onOf(service, workspace, 'ss:s-off')
  assert.equal(mine.get('alpha'), false)
  assert.equal((await loadScenes(dshHome)).active[workspace], 'a')
})

test('follow drops the session choice and lands back on the workspace default', async () => {
  const { dshHome, service, workspace, command } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })
  await setWorkspaceScene(dshHome, service, workspace, 'a')
  await command.handler(exec('s-follow', workspace, 'off'))

  const result = await command.handler(exec('s-follow', workspace, 'follow'))
  assert.equal(result.kind, 'success')
  assert.match(result.text, /已改为跟随工作区/)
  assert.equal((await loadScenes(dshHome)).sessions['s-follow'], undefined)
  assert.equal((await onOf(service, workspace, 'ss:s-follow')).get('alpha'), true)
})

test('an unknown scene name is an error that keeps the usage line', async () => {
  const { workspace, command } = await fixture()
  const result = await command.handler(exec('s-x', workspace, 'nope'))
  assert.equal(result.kind, 'error')
  assert.match(result.text, /场景不存在/)
  assert.match(result.text, /用法/)
})

test('a subagent session acts on the conversation it belongs to', async () => {
  const { dshHome, workspace, command } = await fixture()
  await saveScene(dshHome, { name: 'a', skills: [{ root: 'local', name: 'alpha' }], exclusive: true })

  // 父会话先被看见（真实宿主里闸门刷新会先记一遍每个会话的 cwd）。
  await command.handler(exec('parent-1', workspace, ''))

  // 子代理有自己的 session id、自己没有 cwd：选择应落在父会话上。
  const child = { agent: { session: { id: 'child-1', header: { parentSession: 'parent-1' } } }, rawInput: 'a' }
  const result = await command.handler(child)
  assert.equal(result.kind, 'success')

  const sessions = (await loadScenes(dshHome)).sessions
  assert.equal(sessions['parent-1']?.scene, 'a', 'the choice landed on the root conversation')
  assert.equal(sessions['child-1'], undefined, 'no separate entry is created for the child')
})
