import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deletePreset, digestOf, isValidPresetName, loadPrompts, promptsRootOf, readPreset, savePreset, setPresetEnabled,
} from '../dist/host/prompts/service.js'

async function home() {
  const base = await mkdtemp(join(tmpdir(), 'sm-prompt-'))
  const dshHome = join(base, 'dsh')
  await mkdir(dshHome, { recursive: true })
  return { base, dshHome }
}

test('saves, lists and reads presets, with scope defaulting to global', async () => {
  const { dshHome } = await home()
  const first = await savePreset(dshHome, '写作', '# 写作模式\n\n语气克制。\n')
  assert.equal(first.created, true)
  assert.deepEqual(first.scope, { kind: 'global', path: '' })
  await savePreset(dshHome, 'coding', '# 编码模式\n')
  const state = await loadPrompts(dshHome)
  assert.deepEqual(state.presets.map((preset) => preset.name), ['coding', '写作'])
  assert.equal(state.presets.every((preset) => preset.enabled === false), true, 'new presets are off until enabled')
  assert.deepEqual(state.applied, [])
  assert.equal(await readPreset(dshHome, '写作'), '# 写作模式\n\n语气克制。\n')

  const again = await savePreset(dshHome, '写作', '# 写作模式 v2\n')
  assert.equal(again.created, false)
  assert.equal(await readPreset(dshHome, '写作'), '# 写作模式 v2\n')
})

test('rejects bad names and empty content', async () => {
  const { dshHome } = await home()
  for (const bad of ['', '  ', '../escape', '.hidden', '__backup__', 'a/b', 'x'.repeat(70)]) {
    await assert.rejects(() => savePreset(dshHome, bad, 'x'), /预设名/, `should reject ${JSON.stringify(bad)}`)
  }
  await assert.rejects(() => savePreset(dshHome, 'ok', '   '), /不能为空/)
  assert.equal(isValidPresetName('写作 模式.v2-a_b'), true)
})

test('enabling writes the global AGENTS.md, backs it up and records the digest', async () => {
  const { dshHome } = await home()
  await writeFile(join(dshHome, 'AGENTS.md'), '# 旧的全局指令\n')
  await savePreset(dshHome, '新', '# 新指令\n')

  const result = await setPresetEnabled(dshHome, '新', true)
  assert.equal(result.changed, true)
  assert.equal(result.target, 'global')
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 新指令\n')

  const backups = await readdir(join(promptsRootOf(dshHome), '__backup__', 'global'))
  assert.ok(backups.some((name) => name.includes('before-apply')), 'the replaced AGENTS.md must be backed up')
  assert.ok(backups.some((name) => name.includes('start-')), 'the chain start must be captured')

  const state = await loadPrompts(dshHome)
  const preset = state.presets.find((entry) => entry.name === '新')
  assert.equal(preset.enabled, true)
  assert.equal(state.applied.length, 1)
  assert.equal(state.applied[0].preset, '新')
  assert.equal(state.applied[0].drifted, false)
})

test('disabling restores the chain start, not just one step back', async () => {
  const { dshHome } = await home()
  await writeFile(join(dshHome, 'AGENTS.md'), '# 起点\n')
  await savePreset(dshHome, 'a', '# a\n')
  await savePreset(dshHome, 'b', '# b\n')

  await setPresetEnabled(dshHome, 'a', true)
  const second = await setPresetEnabled(dshHome, 'b', true)
  assert.equal(second.replaced, 'a', 'the other preset on the same target is replaced')
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# b\n')

  await setPresetEnabled(dshHome, 'b', false)
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 起点\n')
  const state = await loadPrompts(dshHome)
  assert.equal(state.applied.length, 0)
  assert.equal(state.presets.every((preset) => preset.enabled === false), true)
})

test('disabling deletes AGENTS.md when the chain started without one', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'only', '# only\n')
  await setPresetEnabled(dshHome, 'only', true)
  assert.equal(await stat(join(dshHome, 'AGENTS.md')).then(() => true), true)
  await setPresetEnabled(dshHome, 'only', false)
  const exists = await stat(join(dshHome, 'AGENTS.md')).then(() => true).catch(() => false)
  assert.equal(exists, false, 'an empty AGENTS.md would be injected as an empty instruction')
})

test('an external edit is reported as drift instead of being ignored', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'p', '# preset\n')
  await setPresetEnabled(dshHome, 'p', true)
  await writeFile(join(dshHome, 'AGENTS.md'), '# 我手改的\n')
  const state = await loadPrompts(dshHome)
  assert.equal(state.applied[0].drifted, true)
  assert.ok(state.warnings.some((warning) => warning.includes('外部改过')))
  assert.equal(digestOf('# 我手改的\n') === digestOf('# preset\n'), false)
})

test('an enabled preset cannot be deleted; a disabled one can', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'keep', '# keep\n')
  await savePreset(dshHome, 'drop', '# drop\n')
  await setPresetEnabled(dshHome, 'keep', true)
  await assert.rejects(() => deletePreset(dshHome, 'keep'), /先停用/)
  await deletePreset(dshHome, 'drop')
  const names = (await loadPrompts(dshHome)).presets.map((preset) => preset.name)
  assert.deepEqual(names, ['keep'])
})

test('backups are capped at five generations', async () => {
  const { dshHome } = await home()
  await writeFile(join(dshHome, 'AGENTS.md'), '# 0\n')
  for (let index = 1; index <= 8; index += 1) {
    await savePreset(dshHome, `p${index}`, `# ${index}\n`)
    await setPresetEnabled(dshHome, `p${index}`, true)
  }
  const backups = (await readdir(join(promptsRootOf(dshHome), '__backup__', 'global'))).filter((name) => name.includes('before-apply'))
  assert.ok(backups.length <= 5, `expected at most 5 backups, got ${backups.length}`)
})

test('a workspace is part of the preset, so two presets can serve two projects at once', async () => {
  const { base, dshHome } = await home()
  const repoA = join(base, 'repo-a')
  const repoB = join(base, 'repo-b')
  await mkdir(repoA, { recursive: true })
  await mkdir(repoB, { recursive: true })
  await savePreset(dshHome, 'A 的规矩', '# A\n', { kind: 'workspace', path: repoA })
  await savePreset(dshHome, 'B 的规矩', '# B\n', { kind: 'workspace', path: repoB })

  await setPresetEnabled(dshHome, 'A 的规矩', true)
  await setPresetEnabled(dshHome, 'B 的规矩', true)
  assert.equal(await readFile(join(repoA, 'AGENTS.md'), 'utf8'), '# A\n')
  assert.equal(await readFile(join(repoB, 'AGENTS.md'), 'utf8'), '# B\n')
  const globalExists = await stat(join(dshHome, 'AGENTS.md')).then(() => true).catch(() => false)
  assert.equal(globalExists, false, 'neither preset touches the global file')

  const state = await loadPrompts(dshHome)
  assert.equal(state.applied.length, 2, 'both targets are active at the same time')
  assert.deepEqual(state.applied.map((record) => record.preset).sort(), ['A 的规矩', 'B 的规矩'])
})

test('disabling one workspace leaves the other untouched', async () => {
  const { base, dshHome } = await home()
  const repoA = join(base, 'repo-a')
  const repoB = join(base, 'repo-b')
  await mkdir(repoA, { recursive: true })
  await mkdir(repoB, { recursive: true })
  await writeFile(join(repoA, 'AGENTS.md'), '# A 起点\n')
  await savePreset(dshHome, 'A', '# A 预设\n', { kind: 'workspace', path: repoA })
  await savePreset(dshHome, 'B', '# B 预设\n', { kind: 'workspace', path: repoB })
  await setPresetEnabled(dshHome, 'A', true)
  await setPresetEnabled(dshHome, 'B', true)

  await setPresetEnabled(dshHome, 'A', false)
  assert.equal(await readFile(join(repoA, 'AGENTS.md'), 'utf8'), '# A 起点\n', 'A returns to its own start')
  assert.equal(await readFile(join(repoB, 'AGENTS.md'), 'utf8'), '# B 预设\n', 'B is still applied')
})

test('changing the scope of an enabled preset is refused', async () => {
  const { base, dshHome } = await home()
  const repo = join(base, 'repo')
  await mkdir(repo, { recursive: true })
  await savePreset(dshHome, 'p', '# p\n')
  await setPresetEnabled(dshHome, 'p', true)
  await assert.rejects(() => savePreset(dshHome, 'p', '# p\n', { kind: 'workspace', path: repo }), /先停用再改作用范围/)
})
