import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPromptSource, deletePreset, digestOf, isValidPresetName, loadPrompts, migrateLegacyAppliedFiles,
  promptsRootOf, readPreset, savePreset, setPresetEnabled,
} from '../dist/host/prompts/service.js'

async function home() {
  const base = await mkdtemp(join(tmpdir(), 'sm-prompt-'))
  const dshHome = join(base, 'dsh')
  await mkdir(dshHome, { recursive: true })
  return { base, dshHome }
}

/** 读一次快照再问「这个工作区该追加什么」——正文函数本身是同步的，读盘在 refresh 里。 */
async function textFor(dshHome, workspace = '') {
  const source = createPromptSource(dshHome)
  await source.refresh()
  return source.textFor(workspace)
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

test('enabling only records the target: the preset body is appended, AGENTS.md is never written', async () => {
  const { dshHome } = await home()
  await writeFile(join(dshHome, 'AGENTS.md'), '# 用户自己的全局指令\n')
  await savePreset(dshHome, '新', '# 新指令\n')

  const result = await setPresetEnabled(dshHome, '新', true)
  assert.equal(result.changed, true)
  assert.equal(result.target, 'global')
  // 用户文件一个字节都不能动 —— 这正是旧版本「覆盖 AGENTS.md」方案的病根。
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 用户自己的全局指令\n')
  assert.equal(await textFor(dshHome), '# 新指令')

  const state = await loadPrompts(dshHome)
  assert.equal(state.presets.find((entry) => entry.name === '新').enabled, true)
  assert.equal(state.applied.length, 1)
  assert.equal(state.applied[0].preset, '新')
})

test('overwriting AGENTS.md by hand leaves the enabled preset working', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'p', '# 预设正文\n')
  await setPresetEnabled(dshHome, 'p', true)
  await writeFile(join(dshHome, 'AGENTS.md'), '# 我手改的\n')

  assert.equal(await textFor(dshHome), '# 预设正文', 'the preset does not live in AGENTS.md')
  const state = await loadPrompts(dshHome)
  assert.equal(state.warnings.length, 0, 'nothing to drift: there is no copy to drift from')
})

test('disabling stops the append and keeps the preset file', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'only', '# only\n')
  await setPresetEnabled(dshHome, 'only', true)
  assert.equal(await textFor(dshHome), '# only')

  const off = await setPresetEnabled(dshHome, 'only', false)
  assert.equal(off.changed, true)
  assert.equal(await textFor(dshHome), '', 'a disabled preset contributes nothing')
  assert.equal(await readPreset(dshHome, 'only'), '# only\n', 'the preset file stays')
  assert.equal((await loadPrompts(dshHome)).applied.length, 0)
})

test('one target holds one preset: enabling another replaces it', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'a', '# a\n')
  await savePreset(dshHome, 'b', '# b\n')

  await setPresetEnabled(dshHome, 'a', true)
  const second = await setPresetEnabled(dshHome, 'b', true)
  assert.equal(second.replaced, 'a', 'the other preset on the same target is replaced')
  assert.equal(await textFor(dshHome), '# b')

  const state = await loadPrompts(dshHome)
  assert.deepEqual(state.applied.map((record) => record.preset), ['b'])
  assert.equal(state.presets.find((preset) => preset.name === 'a').enabled, false, 'the replaced preset is kept, just off')
})

test('editing an enabled preset changes the appended body without re-applying', async () => {
  const { dshHome } = await home()
  await savePreset(dshHome, 'p', '# 第一版\n')
  await setPresetEnabled(dshHome, 'p', true)
  await savePreset(dshHome, 'p', '# 第二版\n')
  assert.equal(await textFor(dshHome), '# 第二版')
})

test('a workspace is part of the preset: each one is appended only inside its own tree', async () => {
  const { base, dshHome } = await home()
  const repoA = join(base, 'repo-a')
  const repoB = join(base, 'repo-b')
  const nested = join(repoA, 'packages', 'app')
  await mkdir(repoB, { recursive: true })
  await mkdir(nested, { recursive: true })
  await savePreset(dshHome, 'A 的规矩', '# A\n', { kind: 'workspace', path: repoA })
  await savePreset(dshHome, 'B 的规矩', '# B\n', { kind: 'workspace', path: repoB })
  await setPresetEnabled(dshHome, 'A 的规矩', true)
  await setPresetEnabled(dshHome, 'B 的规矩', true)

  assert.equal(await textFor(dshHome, repoA), '# A')
  assert.equal(await textFor(dshHome, nested), '# A', 'subdirectories are inside the workspace')
  assert.equal(await textFor(dshHome, repoB), '# B')
  assert.equal(await textFor(dshHome, join(base, 'elsewhere')), '', 'no preset leaks outside its scope')

  const state = await loadPrompts(dshHome)
  assert.equal(state.applied.length, 2, 'both targets are active at the same time')
  assert.deepEqual(state.applied.map((record) => record.preset).sort(), ['A 的规矩', 'B 的规矩'])
})

test('a global preset and a workspace preset are appended broad-to-specific', async () => {
  const { base, dshHome } = await home()
  const repo = join(base, 'repo')
  await mkdir(repo, { recursive: true })
  await savePreset(dshHome, '全局', '# 全局\n')
  await savePreset(dshHome, '项目', '# 项目\n', { kind: 'workspace', path: repo })
  await setPresetEnabled(dshHome, '全局', true)
  await setPresetEnabled(dshHome, '项目', true)

  assert.equal(await textFor(dshHome, repo), '# 全局\n\n# 项目')
  assert.equal(await textFor(dshHome, ''), '# 全局', 'outside any workspace only the global preset applies')
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

test('changing the scope of an enabled preset is refused', async () => {
  const { base, dshHome } = await home()
  const repo = join(base, 'repo')
  await mkdir(repo, { recursive: true })
  await savePreset(dshHome, 'p', '# p\n')
  await setPresetEnabled(dshHome, 'p', true)
  await assert.rejects(() => savePreset(dshHome, 'p', '# p\n', { kind: 'workspace', path: repo }), /先停用再改作用范围/)
})

/**
 * 旧版本（v3）把预设正文覆盖写进了 AGENTS.md。升级后那份副本必须收回去，否则同一条指令会
 * 进两次；而用户自己写的文件一个字都不能动。
 */
test('the legacy AGENTS.md copy is rolled back to the chain start on upgrade', async () => {
  const { dshHome } = await home()
  const root = promptsRootOf(dshHome)
  await mkdir(join(root, '__backup__', 'global'), { recursive: true })
  await writeFile(join(root, '__backup__', 'global', 'AGENTS.md.start-2026'), '# 用户原有的\n')
  await savePreset(dshHome, '旧', '# 旧预设\n')
  await writeFile(join(dshHome, 'AGENTS.md'), '# 旧预设\n')
  await writeFile(join(root, 'index.json'), JSON.stringify({
    version: 3,
    presets: { 旧: { scope: { kind: 'global', path: '' } } },
    applied: {
      global: {
        preset: '旧',
        digest: digestOf('# 旧预设\n'),
        at: Date.now(),
        chainStart: 'AGENTS.md.start-2026',
        agentsPath: join(dshHome, 'AGENTS.md'),
      },
    },
  }))

  const warnings = await migrateLegacyAppliedFiles(dshHome)
  assert.deepEqual(warnings, [])
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 用户原有的\n', 'the user content comes back')
  assert.equal(JSON.parse(await readFile(join(root, 'index.json'), 'utf8')).version, 4)
  assert.equal(await textFor(dshHome), '# 旧预设', 'the preset keeps working, now via the prompt section')
})

test('a hand-edited AGENTS.md is left alone during the legacy migration', async () => {
  const { dshHome } = await home()
  const root = promptsRootOf(dshHome)
  await mkdir(join(root, '__backup__', 'global'), { recursive: true })
  await writeFile(join(root, '__backup__', 'global', 'AGENTS.md.start-2026'), '# 用户原有的\n')
  await savePreset(dshHome, '旧', '# 旧预设\n')
  await writeFile(join(dshHome, 'AGENTS.md'), '# 用户后来手写的\n')
  await writeFile(join(root, 'index.json'), JSON.stringify({
    version: 3,
    presets: { 旧: { scope: { kind: 'global', path: '' } } },
    applied: {
      global: {
        preset: '旧',
        digest: digestOf('# 旧预设\n'),
        at: Date.now(),
        chainStart: 'AGENTS.md.start-2026',
        agentsPath: join(dshHome, 'AGENTS.md'),
      },
    },
  }))

  const warnings = await migrateLegacyAppliedFiles(dshHome)
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('被改过'))
  assert.equal(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), '# 用户后来手写的\n')
})
