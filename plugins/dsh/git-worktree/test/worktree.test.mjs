/**
 * 真实 Git 仓库上的端到端测试：检出、状态、diff、应用、删除。
 *
 * 其中「index 的 stat 缓存必须被写入」是性能回归断言：一旦有人把
 * `checkout-index --all --index` 里的 `--index` 去掉，这条会失败。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, makeRepository, TIMEOUT } from './helpers.mjs'
import {
  applyCheckout,
  createCheckout,
  inspectRemoval,
  listCheckouts,
  readDiff,
  readStatus,
  removeCheckout,
} from '../dist/host/git/worktree.js'

test('create → status → diff → apply → remove', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const root = join(workspace, 'worktrees')
    const target = join(root, 'feature')

    await createCheckout({
      repository,
      root,
      target,
      baseOid,
      mode: 'branch',
      branch: 'worktree/feature',
      reason: 'test',
      timeoutMs: TIMEOUT,
    })

    /* 检出完整：跟踪文件都在，工作区干净，HEAD 在新分支上。 */
    assert.equal(readFileSync(join(target, 'a.txt'), 'utf8'), 'hello\n')
    assert.equal(readFileSync(join(target, 'src', 'b.txt'), 'utf8'), 'world\n')
    assert.equal(git(target, ['status', '--porcelain']), '')
    assert.equal(git(target, ['rev-parse', '--abbrev-ref', 'HEAD']), 'worktree/feature')
    assert.equal(git(repository, ['rev-parse', '--verify', 'refs/heads/worktree/feature']), baseOid)

    /* 性能回归：checkout-index 必须把 stat 缓存写回 index。 */
    const debug = git(target, ['ls-files', '--debug', 'a.txt'])
    assert.ok(!debug.includes('ctime: 0:0'), 'index 的 stat 缓存没有被写入:\n' + debug)

    const clean = await readStatus(target, baseOid, TIMEOUT)
    assert.deepEqual(clean, { dirty: 0, files: 0, ahead: 0, behind: 0 })

    /* 改一个跟踪文件 + 加一个未跟踪文件。 */
    writeFileSync(join(target, 'a.txt'), 'hello changed\n')
    writeFileSync(join(target, 'new.txt'), 'new\n')

    const status = await readStatus(target, baseOid, TIMEOUT)
    assert.equal(status.dirty, 2)
    assert.equal(status.files, 1)

    const diff = await readDiff(target, baseOid, TIMEOUT)
    assert.match(diff.patch, /\+hello changed/)
    assert.deepEqual(diff.untracked, ['new.txt'])
    assert.equal(diff.truncated, false)

    /* 应用回主仓：改动进入主仓工作区，但主仓 HEAD 不变。 */
    const before = git(repository, ['rev-parse', 'HEAD'])
    const applied = await applyCheckout({ repository, target, baseOid, timeoutMs: TIMEOUT })
    assert.equal(applied.applied, true)
    assert.equal(applied.files, 2)
    assert.equal(readFileSync(join(repository, 'a.txt'), 'utf8'), 'hello changed\n')
    assert.equal(readFileSync(join(repository, 'new.txt'), 'utf8'), 'new\n')
    assert.equal(git(repository, ['rev-parse', 'HEAD']), before)

    await removeCheckout(repository, target, TIMEOUT)
    assert.equal(existsSync(target), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('create refuses an occupied target', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const root = join(workspace, 'worktrees')
    const target = join(root, 'feature')
    mkdirSync(target, { recursive: true })

    await assert.rejects(
      () => createCheckout({
        repository,
        root,
        target,
        baseOid,
        mode: 'branch',
        branch: 'worktree/occupied',
        reason: 'test',
        timeoutMs: TIMEOUT,
      }),
      (error) => error.code === 'duplicate-worktree',
    )
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('create refuses a branch that already exists', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    git(repository, ['branch', 'worktree/taken'])

    await assert.rejects(
      () => createCheckout({
        repository,
        root: join(workspace, 'worktrees'),
        target: join(workspace, 'worktrees', 'taken'),
        baseOid,
        mode: 'branch',
        branch: 'worktree/taken',
        reason: 'test',
        timeoutMs: TIMEOUT,
      }),
      (error) => error.code === 'duplicate-branch',
    )
    /* 失败不留下登记与空目录。 */
    assert.equal(existsSync(join(workspace, 'worktrees', 'taken')), false)
    assert.equal((await listCheckouts(repository, TIMEOUT)).length, 1)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('removal inspection reports risk only when nothing else contains the commits', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'risk')
    await createCheckout({
      repository,
      root: join(workspace, 'worktrees'),
      target,
      baseOid,
      mode: 'detached',
      branch: null,
      reason: 'test',
      timeoutMs: TIMEOUT,
    })

    const clean = await inspectRemoval({ repository, target, baseOid, timeoutMs: TIMEOUT })
    assert.equal(clean.atRisk, false)
    assert.equal(clean.branch, null)

    writeFileSync(join(target, 'c.txt'), 'c\n')
    git(target, ['add', '-A'])
    git(target, ['commit', '-q', '-m', 'detached work'])
    const risky = await inspectRemoval({ repository, target, baseOid, timeoutMs: TIMEOUT })
    assert.equal(risky.atRisk, true)
    assert.equal(risky.ahead, 1)

    /* 只需任意一个分支（或远端）包含它，就不再算「只有这里知道」。 */
    git(repository, ['branch', 'keep', git(target, ['rev-parse', 'HEAD'])])
    const safe = await inspectRemoval({ repository, target, baseOid, timeoutMs: TIMEOUT })
    assert.equal(safe.atRisk, false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('listCheckouts reports branches, locks and the main checkout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'listed')
    await createCheckout({
      repository,
      root: join(workspace, 'worktrees'),
      target,
      baseOid,
      mode: 'branch',
      branch: 'worktree/listed',
      reason: 'locked-by-test',
      timeoutMs: TIMEOUT,
    })
    /* createCheckout 收尾会 unlock；再锁一次观察 locked 字段。 */
    git(repository, ['worktree', 'lock', '--reason', 'locked-by-test', target])

    const checkouts = await listCheckouts(repository, TIMEOUT)
    assert.equal(checkouts.length, 2)
    assert.equal(checkouts[0].path.toLowerCase(), repository.toLowerCase())
    const linked = checkouts.find((checkout) => checkout.path.toLowerCase() === target.toLowerCase())
    assert.equal(linked.branch, 'worktree/listed')
    assert.equal(linked.locked, true)
    assert.equal(linked.detached, false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('apply is a no-op for a clean worktree', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const root = join(workspace, 'worktrees')
    const target = join(root, 'clean')

    await createCheckout({
      repository,
      root,
      target,
      baseOid,
      mode: 'detached',
      branch: null,
      reason: 'test',
      timeoutMs: TIMEOUT,
    })
    const result = await applyCheckout({ repository, target, baseOid, timeoutMs: TIMEOUT })
    assert.deepEqual(result, { applied: true, files: 0, snapshotOid: null })
    assert.equal(git(repository, ['status', '--porcelain']), '')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})
