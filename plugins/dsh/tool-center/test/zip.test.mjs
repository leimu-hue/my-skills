import test from 'node:test'
import assert from 'node:assert/strict'
import { readZip, writeZip, crc32 } from '../dist/host/shared/zip.js'

test('round-trips stored and deflated entries', () => {
  const files = [
    { name: 'a/SKILL.md', data: Buffer.from('---\nname: a\n---\nbody') },
    { name: 'a/references/big.md', data: Buffer.from('x'.repeat(4000)) },
    { name: 'b.md', data: Buffer.from('flat') },
  ]
  const archive = writeZip(files)
  const back = readZip(archive)
  assert.equal(back.length, 3)
  const byName = new Map(back.map((entry) => [entry.name, entry.data.toString('utf8')]))
  assert.equal(byName.get('a/SKILL.md'), files[0].data.toString('utf8'))
  assert.equal(byName.get('a/references/big.md'), files[1].data.toString('utf8'))
  assert.equal(byName.get('b.md'), 'flat')
})

test('directory entries are skipped', () => {
  const archive = writeZip([
    { name: 'dir/', data: Buffer.alloc(0) },
    { name: 'dir/SKILL.md', data: Buffer.from('x') },
  ])
  assert.equal(readZip(archive).length, 1)
})

test('crc32 matches the known value for "123456789"', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
})

test('rejects an absolute path in the archive', () => {
  const archive = writeZip([{ name: '/etc/passwd', data: Buffer.from('x') }])
  assert.throws(() => readZip(archive), /绝对路径/)
})

test('rejects a parent-directory escape', () => {
  const archive = writeZip([{ name: '../../evil/SKILL.md', data: Buffer.from('x') }])
  assert.throws(() => readZip(archive), /上跳路径/)
})

test('rejects a truncated archive', () => {
  const archive = writeZip([{ name: 'a.txt', data: Buffer.from('hello') }])
  assert.throws(() => readZip(archive.subarray(0, 20)), /zip/)
})

test('enforces the entry size cap', () => {
  const archive = writeZip([{ name: 'a.txt', data: Buffer.from('x'.repeat(1000)) }])
  assert.throws(() => readZip(archive, { maxEntryBytes: 10 }), /条目过大/)
})
