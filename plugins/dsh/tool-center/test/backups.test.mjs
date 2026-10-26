import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeBackup } from '../dist/host/shared/backups.js'

test('writeBackup names by stamp, writes content and prunes by prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sm-backup-'))
  // 预置三份旧备份：keep=2 时应该只留下最新的一份 + 本次写入。
  for (const name of ['AGENTS.md.bak-2020-01-01T00-00-00-000Z', 'AGENTS.md.bak-2020-01-02T00-00-00-000Z', 'AGENTS.md.bak-2020-01-03T00-00-00-000Z']) {
    await writeFile(join(dir, name), 'old')
  }

  const result = await writeBackup({
    dir,
    baseName: 'AGENTS.md.bak',
    content: 'new',
    keep: 2,
    prunePrefix: 'AGENTS.md.',
    atomic: false,
  })

  assert.equal(result.fileName, `AGENTS.md.bak-${result.stamp}`)
  assert.equal(await readFile(join(dir, result.fileName), 'utf8'), 'new')
  const names = await readdir(dir)
  assert.equal(names.length, 2, 'only the newest two survive')
  assert.ok(names.includes(result.fileName))
})

test('writeBackup uses atomic writes by default and creates the directory', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-backup-'))
  const dir = join(base, 'nested', 'backups')
  const result = await writeBackup({ dir, baseName: 'cordis.patch.yml.bak', content: 'patched', keep: 5 })
  assert.equal(await readFile(join(dir, result.fileName), 'utf8'), 'patched')
  assert.equal((await readdir(dir)).length, 1)
})
