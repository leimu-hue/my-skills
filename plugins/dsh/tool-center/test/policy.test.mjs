import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultState } from '../dist/host/skills/state.js'
import { groupRows, needsOverlay, modelVisible, policyOf, rowOf } from '../dist/host/skills/policy.js'

function root(overrides = {}) {
  return {
    key: 'local', path: 'C:\\home\\.dsh\\skills', rank: 400, label: 'DSH 技能', kind: 'local',
    writable: true, toggleable: true, hostScans: true, ...overrides,
  }
}

function entry(overrides = {}) {
  return {
    name: 'demo', declaredName: 'demo', description: 'd', docPath: 'C:\\x\\demo\\SKILL.md',
    entryPath: 'C:\\x\\demo', form: 'bundle', declaresModelInvocable: true, declaresUserInvocable: true,
    loadable: true, linked: false, nested: false, ...overrides,
  }
}

test('the lower rank wins and the loser is marked shadowed', () => {
  const state = defaultState()
  const rows = [
    rowOf({ root: root({ key: 'claude', rank: 530, hostScans: false }), entry: entry({ docPath: 'c' }) }, state),
    rowOf({ root: root({ key: 'local', rank: 400 }), entry: entry({ docPath: 'l' }) }, state),
  ]
  groupRows(rows)
  const winner = rows.find((row) => row.rootKey === 'local')
  const loser = rows.find((row) => row.rootKey === 'claude')
  assert.equal(winner.shadowed, false)
  assert.equal(loser.shadowed, true)
  assert.equal(loser.shadowedBy.rootKey, 'local')
})

test('an explicit pin beats rank', () => {
  const state = defaultState()
  state.preferredSkills.demo = 'claude'
  const rows = [
    rowOf({ root: root({ key: 'local', rank: 400 }), entry: entry() }, state),
    rowOf({ root: root({ key: 'claude', rank: 530, hostScans: false }), entry: entry() }, state),
  ]
  groupRows(rows)
  assert.equal(rows.find((row) => row.rootKey === 'claude').shadowed, false)
  assert.equal(rows.find((row) => row.rootKey === 'local').shadowed, true)
})

test('a disabled winner still shadows the copies below it', () => {
  const state = defaultState()
  state.hiddenSkills = { local: ['demo'] }
  const rows = [
    rowOf({ root: root({ key: 'local', rank: 400 }), entry: entry() }, state),
    rowOf({ root: root({ key: 'claude', rank: 530, hostScans: false }), entry: entry() }, state),
  ]
  groupRows(rows)
  const winner = rows.find((row) => row.rootKey === 'local')
  assert.equal(winner.winner, true)
  assert.equal(winner.policy.modelInvocable, false)
  // 下面的副本不该因为赢家被关掉就浮上来。
  assert.equal(rows.find((row) => row.rootKey === 'claude').shadowed, true)
  assert.equal(modelVisible(rows.find((row) => row.rootKey === 'claude')), false)
})

test('a root switch turns every skill in it off, and a project root cannot be switched', () => {
  const state = defaultState()
  state.sources.claude = false
  const row = rowOf({ root: root({ key: 'claude', rank: 530, hostScans: false }), entry: entry() }, state)
  assert.equal(row.policy.rootOn, false)
  assert.equal(row.policy.modelInvocable, false)

  const project = rowOf({ root: root({ key: 'project-dsh:abc', rank: 100, project: true, kind: 'project-dsh' }), entry: entry() }, state)
  state.sources['project-dsh:abc'] = false
  const still = rowOf({ root: root({ key: 'project-dsh:abc', rank: 100, project: true, kind: 'project-dsh' }), entry: entry() }, state)
  assert.equal(still.policy.rootOn, true, 'a project root cannot be switched off (its existence follows the cwd)')
  assert.equal(project.policy.rootOn, true)
})

test('a skill’s own frontmatter flags are honoured', () => {
  const state = defaultState()
  const manualOnly = rowOf({ root: root(), entry: entry({ declaresModelInvocable: false }) }, state)
  assert.equal(manualOnly.policy.modelInvocable, false)
  assert.equal(manualOnly.policy.userInvocable, true)
  const invalid = rowOf({ root: root(), entry: entry({ loadable: false, problem: 'missing description' }) }, state)
  assert.equal(invalid.policy.modelInvocable, false)
})

test('needsOverlay stays out of the host’s way when nothing changes', () => {
  const state = defaultState()
  const clean = rowOf({ root: root(), entry: entry() }, state)
  assert.equal(needsOverlay(clean, true), false, 'host already serves it: no candidate')

  const hostScans = false
  assert.equal(needsOverlay(clean, hostScans), true, 'the host cannot see this root at all')

  state.hiddenSkills = { local: ['demo'] }
  const off = rowOf({ root: root(), entry: entry() }, state)
  assert.equal(needsOverlay(off, true), true, 'switched off: we must publish a non-invocable candidate')

  const nested = rowOf({ root: root(), entry: entry({ nested: true }) }, state)
  assert.equal(needsOverlay(nested, true), true, 'nested deeper than host discovery')
})

test('policyOf is the single source: root gate and skill gate are both reported', () => {
  const state = defaultState()
  state.sources.local = false
  state.hiddenSkills = { local: ['demo'] }
  const policy = policyOf({ root: root(), entry: entry() }, state)
  assert.deepEqual(policy, { rootOn: false, skillOn: false, modelInvocable: false, userInvocable: false })
})
