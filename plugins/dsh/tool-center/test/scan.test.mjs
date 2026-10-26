import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScanner } from '../dist/host/skills/scan.js'

function rootOf(path) {
  return { key: 'local', path, rank: 400, label: 'root', kind: 'local', writable: true, toggleable: true, hostScans: true }
}

async function skill(dir, name, description) {
  await mkdir(join(dir, name), { recursive: true })
  await writeFile(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`)
}

test('discovers bundles, flat files and nested bundles, and flags nesting', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await skill(base, 'top', 'top level')
  await writeFile(join(base, 'flat.md'), '---\nname: flat\ndescription: flat file\n---\n')
  await skill(join(base, 'category'), 'deep', 'nested')

  const scanner = createScanner()
  const result = await scanner.scan(rootOf(base))
  const names = result.entries.map((entry) => entry.name).sort()
  assert.deepEqual(names, ['deep', 'flat', 'top'])
  assert.equal(result.entries.find((entry) => entry.name === 'top').nested, false)
  assert.equal(result.entries.find((entry) => entry.name === 'deep').nested, true)
  assert.equal(result.entries.find((entry) => entry.name === 'flat').form, 'flat')
})

test('skips node_modules and dot directories', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await skill(base, 'real', 'real skill')
  await skill(join(base, 'node_modules', 'pkg'), 'dep', 'dependency noise')
  await skill(join(base, '.hidden'), 'secret', 'hidden')
  const scanner = createScanner()
  const result = await scanner.scan(rootOf(base))
  assert.deepEqual(result.entries.map((entry) => entry.name), ['real'])
})

test('a missing root is an empty result, not an error', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  const scanner = createScanner()
  const result = await scanner.scan(rootOf(join(base, 'does-not-exist')))
  assert.deepEqual(result.entries, [])
  assert.equal(result.error, undefined)
})

test('an unreadable root reports an error instead of pretending it is empty', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  const blocker = join(base, 'not-a-directory')
  await writeFile(blocker, 'x')
  const scanner = createScanner()
  const result = await scanner.scan(rootOf(blocker))
  assert.equal(result.entries.length, 0)
  assert.ok(typeof result.error === 'string' && result.error.length > 0)
})

test('the parse cache is reused while mtime and size are unchanged, and invalidated when they move', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await skill(base, 'cached', 'first description')
  const scanner = createScanner()
  const first = await scanner.scan(rootOf(base))
  assert.equal(first.entries[0].description, 'first description')
  assert.equal(scanner.stats().parsed, 1)

  // 第二次扫同一个未变的文件：解析缓存条目被复用。
  const second = await scanner.scan(rootOf(base))
  assert.equal(second.entries[0].description, 'first description')
  assert.equal(scanner.stats().parsed, 1)

  // 大小变了就作废该条目，所以外部编辑器改了文件，下一次读就能看到 —— 不用等 TTL。
  await writeFile(join(base, 'cached', 'SKILL.md'), '---\nname: cached\ndescription: second description is longer\n---\nbody\n')
  const third = await scanner.scan(rootOf(base))
  assert.equal(third.entries[0].description, 'second description is longer')
})

test('concurrent reads of one root share a single walk', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await skill(base, 'one', 'one')
  const scanner = createScanner()
  const [a, b] = await Promise.all([scanner.scan(rootOf(base)), scanner.scan(rootOf(base))])
  assert.equal(a.entries.length, 1)
  assert.equal(b.entries.length, 1)
  // 遍历一结束合流记录就丢掉：它不是结果缓存。
  assert.equal(scanner.stats().roots, 0)
})

test('a new skill shows up on the next read and the generation counter moves', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await skill(base, 'one', 'one')
  const scanner = createScanner()
  assert.equal((await scanner.scan(rootOf(base))).entries.length, 1)
  await skill(base, 'two', 'two')
  assert.equal((await scanner.scan(rootOf(base))).entries.length, 2)
  const before = scanner.generation()
  scanner.invalidate()
  assert.ok(scanner.generation() > before)
})

test('an entry that is not loadable says why instead of vanishing', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await mkdir(join(base, 'broken'), { recursive: true })
  await writeFile(join(base, 'broken', 'SKILL.md'), '---\nname: broken\n---\nno description here\n')
  const scanner = createScanner()
  const result = await scanner.scan(rootOf(base))
  const entry = result.entries.find((candidate) => candidate.name === 'broken')
  assert.ok(entry !== undefined)
  assert.equal(entry.loadable, false)
  assert.match(entry.problem, /description/)
})

test('a bad invocation flag is a reported problem, not a silent permission', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await mkdir(join(base, 'odd'), { recursive: true })
  await writeFile(join(base, 'odd', 'SKILL.md'), '---\nname: odd\ndescription: d\ndisable-model-invocation: maybe\n---\n')
  const scanner = createScanner()
  const result = await scanner.scan(rootOf(base))
  const entry = result.entries.find((candidate) => candidate.name === 'odd')
  assert.equal(entry.loadable, false)
  assert.equal(entry.declaresModelInvocable, false)
  assert.match(entry.problem, /disable-model-invocation/)
})

test('the caps bound a pathological tree', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  for (let index = 0; index < 6; index += 1) await skill(base, `s${index}`, 'x')
  const scanner = createScanner({ maxEntries: 3 })
  const result = await scanner.scan(rootOf(base))
  assert.equal(result.entries.length, 3)
  assert.equal(result.truncated, true)
})

test('readBody returns the document body, not the frontmatter', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-scan-'))
  await mkdir(join(base, 'body'), { recursive: true })
  await writeFile(join(base, 'body', 'SKILL.md'), '---\nname: body\ndescription: d\n---\n\n# Heading\ntext\n')
  const scanner = createScanner()
  const [entry] = (await scanner.scan(rootOf(base))).entries
  const body = await scanner.readBody(entry)
  assert.equal(body.trim(), '# Heading\ntext')
  await rm(base, { recursive: true, force: true })
})
