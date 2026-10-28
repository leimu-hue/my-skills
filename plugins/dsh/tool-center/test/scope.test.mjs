import test from 'node:test'
import assert from 'node:assert/strict'
import { rootSessionIdOf, sessionIdOf, workspaceOfAgent } from '../dist/host/scope/agent-scope.js'

/** 一个最小 agent：会话头就是宿主真实给的那几格。 */
const agent = (id, header = {}, extra = {}) => ({ session: { id, header, ...extra } })

test('the session id is read from the live session object or the persisted header', () => {
  assert.equal(sessionIdOf(agent('s-1')), 's-1')
  assert.equal(sessionIdOf({ session: { header: { id: 's-2' } } }), 's-2')
  assert.equal(sessionIdOf({ session: {} }), null)
  assert.equal(sessionIdOf({}), null)
})

test('a subagent resolves to its root conversation, through the whole chain', () => {
  const root = agent('root-a')
  const child = agent('child-a', { parentSession: 'root-a' })
  const grandchild = agent('grand-a', { parentSession: 'child-a' })

  assert.equal(rootSessionIdOf(root), 'root-a')
  assert.equal(rootSessionIdOf(child), 'root-a')
  assert.equal(rootSessionIdOf(grandchild), 'root-a', 'nested delegation walks all the way up')
})

test('a broken or cyclic parent chain stops instead of looping', () => {
  // 未知父会话：停在链上最后一个已知 id。它的 cwd 没记过，所以工作区解析会退回自己的。
  assert.equal(rootSessionIdOf(agent('orphan-a', { parentSession: 'gone-a' })), 'gone-a')
  assert.equal(workspaceOfAgent(agent('orphan-a', { cwd: 'D:\\own', parentSession: 'gone-a' })), 'D:\\own')
  assert.equal(rootSessionIdOf(agent('self-a', { parentSession: 'self-a' })), 'self-a', 'a self-reference is not followed')

  const a = agent('cycle-a', { parentSession: 'cycle-b' })
  const b = agent('cycle-b', { parentSession: 'cycle-a' })
  rootSessionIdOf(a)
  rootSessionIdOf(b)
  assert.equal(rootSessionIdOf(a), 'cycle-b', 'the walk terminates even when the data is circular')
})

test('a session resolves to its own cwd workspace', () => {
  const workspace = workspaceOfAgent(agent('own-1', { cwd: 'D:\\repo' }))
  assert.equal(workspace, 'D:\\repo')
})

test('a subagent inherits the workspace of the parent it belongs to', () => {
  // 父会话的 cwd 只知道一次（parentSession 只给 id），子会话自己甚至没有 cwd。
  const parent = agent('parent-w', { cwd: 'D:\\proj\\alpha' })
  assert.equal(workspaceOfAgent(parent), 'D:\\proj\\alpha')

  const child = agent('child-w', { parentSession: 'parent-w' })
  assert.equal(workspaceOfAgent(child), 'D:\\proj\\alpha', 'a subagent does not escape the parent workspace')

  // 子会话自己带的是别的 cwd 时，父会话的工作区仍然优先 —— 场景属于那次对话。
  const child2 = agent('child-w2', { cwd: 'D:\\tmp\\scratch', parentSession: 'parent-w' })
  assert.equal(workspaceOfAgent(child2), 'D:\\proj\\alpha')
})

test('an unknown parent falls back to the child own cwd, then to "no workspace"', () => {
  assert.equal(workspaceOfAgent(agent('child-x', { cwd: 'D:\\own', parentSession: 'never-seen' })), 'D:\\own')
  assert.equal(workspaceOfAgent(agent('child-y', { parentSession: 'never-seen' })), '')
  assert.equal(workspaceOfAgent({}), '', 'no session identity means no isolation, never a guess')
})

test('the legacy meta.cwd shape is still understood', () => {
  assert.equal(workspaceOfAgent({ session: { id: 'meta-1', meta: { cwd: 'D:\\legacy' } } }), 'D:\\legacy')
})
