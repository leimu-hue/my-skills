/** 路径与布局规则：这些是「能不能删除用户文件」的第一道边界。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join, sep } from 'node:path'
import {
  branchNameFor,
  isInside,
  normalizeWorktreeDir,
  repositoryKey,
  validateName,
  worktreePath,
  worktreesRoot,
} from '../dist/host/shared/paths.js'

test('validateName accepts plain names', () => {
  assert.equal(validateName('fix-login'), 'fix-login')
  assert.equal(validateName('  release_1.2  '), 'release_1.2')
  assert.equal(validateName('a'), 'a')
})

test('validateName rejects traversal, separators and reserved names', () => {
  for (const value of ['', '..', '../x', 'a/b', 'a\\b', 'con', 'NUL', 'com1', 'name.', '.hidden', 'a b', 42, null]) {
    assert.throws(() => validateName(value), (error) => error.code === 'invalid-name', String(value))
  }
})

test('normalizeWorktreeDir keeps one relative segment and rejects escapes', () => {
  assert.equal(normalizeWorktreeDir('.worktrees'), '.worktrees')
  assert.equal(normalizeWorktreeDir(' build/worktrees/ '), 'build/worktrees')
  for (const value of ['', '..', '../outside', '/abs', 'C:\\abs', '.', 'a//b', 42, null]) {
    assert.throws(() => normalizeWorktreeDir(value), (error) => error.code === 'invalid-layout', String(value))
  }
})

test('repositoryKey is a stable, path-safe directory name', () => {
  const first = repositoryKey('C:\\work\\My Repo')
  const second = repositoryKey('C:\\work\\My Repo')
  assert.equal(first, second)
  assert.match(first, /^[A-Za-z0-9._-]+$/)
  /* 纯中文目录名清洗后为空，完全退回哈希。 */
  assert.match(repositoryKey('C:\\work\\项目'), /^[0-9a-f]{10}$/)
})

test('repo layout puts checkouts inside the repository', () => {
  const repository = join('C:\\', 'work', 'repo')
  const root = worktreesRoot(join('C:\\', 'state'), repository, 'repo', '.worktrees')
  const target = worktreePath(join('C:\\', 'state'), repository, 'repo', '.worktrees', 'feature')
  assert.equal(root, join(repository, '.worktrees'))
  assert.equal(target, join(root, 'feature'))
  assert.equal(isInside(root, target), true)
})

test('state layout keeps the managed-root shape', () => {
  const base = join('C:\\', 'state')
  const repository = join('C:\\', 'work', 'repo')
  const root = worktreesRoot(base, repository, 'state', '.worktrees')
  const target = worktreePath(base, repository, 'state', '.worktrees', 'feature')
  assert.ok(root.startsWith(join(base, 'worktrees')))
  assert.equal(target, join(root, 'feature'))
  assert.equal(isInside(root, target), true)
})

test('default branches are grouped under worktree/', () => {
  assert.equal(branchNameFor('fix-login'), 'worktree/fix-login')
})

test('isInside refuses escapes', () => {
  const parent = join('C:\\', 'state', 'worktrees', 'repo')
  assert.equal(isInside(parent, join(parent, 'a')), true)
  assert.equal(isInside(parent, join(parent, '..', 'b')), false)
  assert.equal(isInside(parent, parent), false)
  assert.equal(isInside(parent, `${parent}${sep}..${sep}x`), false)
})
