import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultState, loadState, normalizeState, pruneState, resolveLayer, saveState, skillSwitchOf, sourceSwitchOf, forgetSkillEverywhere } from '../dist/host/skills/state.js'

async function tempHome() {
  return mkdtemp(join(tmpdir(), 'sm-state-'))
}

test('a missing file is a normal first run, not a degradation', async () => {
  const home = await tempHome()
  const loaded = await loadState(join(home, 'state.json'))
  assert.equal(loaded.origin, 'default')
  assert.equal(loaded.degraded, false)
  assert.deepEqual(loaded.state.hiddenSkills, {})
})

test('a corrupt file is backed up and replaced by defaults (never fail-closed)', async () => {
  const home = await tempHome()
  const file = join(home, 'state.json')
  await writeFile(file, '{ this is not json')
  const loaded = await loadState(file)
  assert.equal(loaded.degraded, true)
  assert.equal(loaded.origin, 'recovered')
  assert.equal(loaded.warnings.length, 1)
  // 写路径必须照常可用 —— 这正是重点。
  await saveState(file, { ...defaultState(), hiddenSkills: { local: ['x'] } })
  const again = await loadState(file)
  assert.deepEqual(again.state.hiddenSkills.local, ['x'])
  assert.equal(again.degraded, false)
})

test('normalize keeps what it understands and drops the rest with a warning', () => {
  const { state, warnings } = normalizeState({
    version: 1,
    sources: { local: false, ghost: 'nope' },
    removedSources: ['claude', 42],
    hiddenSkills: { local: ['a', 'a', ''] },
    preferredSkills: { dup: 'codex', bad: 7 },
    customRoots: [
      { key: 'custom-0123456789abcdef', path: 'C:\\skills', label: 'mine', rank: 610 },
      { key: 'nope', path: 'C:\\x' },
    ],
    ranks: { local: 401, bad: 'x' },
    layers: { sessions: { s1: { hiddenSkills: { local: ['b'] } } }, workspaces: {} },
  })
  assert.equal(state.sources.local, false)
  assert.equal(state.sources.ghost, undefined)
  assert.deepEqual(state.removedSources, ['claude'])
  assert.deepEqual(state.hiddenSkills.local, ['a'])
  assert.deepEqual(state.preferredSkills, { dup: 'codex' })
  assert.equal(state.customRoots.length, 1)
  assert.equal(state.customRoots[0].label, 'mine')
  assert.equal(state.ranks.local, 401)
  assert.equal(state.ranks.bad, undefined)
  assert.deepEqual(state.layers.sessions.s1.hiddenSkills.local, ['b'])
  assert.ok(warnings.some((warning) => warning.includes('自定义目录记录无效')))
})

test('a non-object document degrades to defaults with a warning', () => {
  const { state, warnings } = normalizeState([1, 2, 3])
  assert.deepEqual(state.hiddenSkills, {})
  assert.equal(warnings.length, 1)
})

test('scope layers are reserved: resolveLayer returns undefined until one is written', () => {
  const state = defaultState()
  assert.equal(resolveLayer(state, 'session-1'), undefined)
  assert.equal(skillSwitchOf(state, 'local', 'x', 'session-1'), true)
  state.layers.sessions['session-1'] = { hiddenSkills: { local: ['x'] } }
  assert.deepEqual(resolveLayer(state, 'session-1')?.hiddenSkills?.local, ['x'])
  assert.equal(skillSwitchOf(state, 'local', 'x', 'session-1'), false)
  // 会话层不影响全局层。
  assert.equal(skillSwitchOf(state, 'local', 'x'), true)
  // 工作区层用 `ws:<cwd>` 寻址。
  state.layers.workspaces['D:\\repo'] = { sources: { codex: false } }
  assert.equal(sourceSwitchOf(state, 'codex', 'ws:D:\\repo'), false)
  assert.equal(sourceSwitchOf(state, 'codex', 'other'), true)
})

test('prune drops policy names that no longer exist but keeps unscanned roots', () => {
  const state = defaultState()
  state.hiddenSkills = { local: ['gone', 'kept'], codex: ['x'] }
  state.preferredSkills = { kept: 'local', gone: 'local', elsewhere: 'custom-0123456789abcdef' }
  const live = new Map([
    ['local', new Set(['kept'])],
  ])
  const result = pruneState(state, live)
  assert.equal(result.changed, true)
  assert.deepEqual(state.hiddenSkills.local, ['kept'])
  // codex 这一轮没被扫到：它的策略必须留着。
  assert.deepEqual(state.hiddenSkills.codex, ['x'])
  // `elsewhere` 指向一个没被扫的来源：保留。
  assert.equal(state.preferredSkills.elsewhere, 'custom-0123456789abcdef')
  // `gone` 指向被扫过的来源，而那条技能已经不在了。
  assert.equal(state.preferredSkills.gone, undefined)
  assert.equal(state.preferredSkills.kept, 'local')
})

test('forgetSkillEverywhere clears global and layered records', () => {
  const state = defaultState()
  state.hiddenSkills = { local: ['a', 'b'] }
  state.preferredSkills = { a: 'local' }
  state.layers.sessions.s1 = { hiddenSkills: { local: ['a'] }, preferredSkills: { a: 'local' } }
  const changed = forgetSkillEverywhere(state, 'local', 'a')
  assert.equal(changed, true)
  assert.deepEqual(state.hiddenSkills.local, ['b'])
  assert.equal(state.preferredSkills.a, undefined)
  assert.deepEqual(state.layers.sessions.s1.hiddenSkills.local, [])
  assert.equal(state.layers.sessions.s1.preferredSkills.a, undefined)
})

test('saveState writes JSON that loadState reads back', async () => {
  const home = await tempHome()
  await mkdir(join(home, 'nested'), { recursive: true })
  const file = join(home, 'nested', 'state.json')
  const state = defaultState()
  state.sources.codex = false
  await saveState(file, state)
  const raw = await readFile(file, 'utf8')
  assert.match(raw, /"codex": false/)
  const loaded = await loadState(file)
  assert.equal(loaded.state.sources.codex, false)
  assert.equal(loaded.degraded, false)
})
