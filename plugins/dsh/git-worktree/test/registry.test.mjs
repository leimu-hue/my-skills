/** 注册表：只存形状合法的记录，坏文件按空表处理。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorktreeRegistry } from '../dist/host/worktree/registry.js'

function makeRegistry() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-worktree-registry-'))
  return { directory, file: join(directory, 'worktrees.json'), registry: new WorktreeRegistry(join(directory, 'worktrees.json')) }
}

function record(overrides = {}) {
  return {
    id: 'id-1',
    name: 'feature',
    repository: 'C:\\work\\repo',
    repositoryName: 'repo',
    path: 'C:\\state\\worktrees\\repo\\feature',
    baseOid: 'a'.repeat(40),
    baseBranch: 'main',
    mode: 'branch',
    branch: 'worktree/feature',
    createdAt: 1,
    workspaceId: null,
    ...overrides,
  }
}

test('add / find / list / remove', () => {
  const { directory, registry } = makeRegistry()
  try {
    registry.add(record())
    registry.add(record({ id: 'id-2', name: 'second', createdAt: 2 }))

    assert.equal(registry.find('id-1').name, 'feature')
    assert.equal(registry.findByName('C:\\work\\repo', 'second').id, 'id-2')
    assert.equal(registry.list().length, 2)
    /* 最近创建的在前。 */
    assert.equal(registry.list()[0].id, 'id-2')
    assert.equal(registry.list('C:\\other').length, 0)

    registry.update('id-2', { workspaceId: 'ws-1' })
    assert.equal(registry.find('id-2').workspaceId, 'ws-1')

    registry.remove('id-1')
    assert.equal(registry.find('id-1'), undefined)
    assert.equal(registry.list().length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a corrupt file degrades to an empty table', () => {
  const { directory, file, registry } = makeRegistry()
  try {
    writeFileSync(file, '{ not json')
    assert.deepEqual(registry.list(), [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('malformed records are dropped on read', () => {
  const { directory, file, registry } = makeRegistry()
  try {
    const broken = record({ id: 'bad', repository: 'relative/path' })
    writeFileSync(file, JSON.stringify({ version: 1, worktrees: { good: record({ id: 'good' }), bad: broken } }))
    const list = registry.list()
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'good')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('writes a versioned document', () => {
  const { directory, file, registry } = makeRegistry()
  try {
    registry.add(record())
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(parsed.version, 1)
    assert.equal(parsed.worktrees['id-1'].name, 'feature')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
