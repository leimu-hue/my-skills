/**
 * 回归测试：每一条都对应一个「曾经会破坏用户仓库或静默丢失记录」的缺陷。
 *
 * 这些断言不看「功能有没有」，只看「出错时有没有撒谎」：
 *   * 基线必须是提交 id，不是分支名（否则补丁方向反了）；
 *   * 探测缓存不能把检出当成主仓（否则主仓被拒建）；
 *   * 冲突时主仓必须一个字节都没变；
 *   * 删除失败必须报失败（以前会报成功，记录也随之消失）；
 *   * 重命名只算一个改动（`status -z` 里它占两条记录）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorktreeService } from '../dist/host/worktree/service.js'
import { applyCheckout, createCheckout, readStatus, removeCheckout } from '../dist/host/git/worktree.js'
import { inspectRepository } from '../dist/host/git/repository.js'
import { runCommand } from '../dist/host/shared/exec.js'
import { git, makeRepository, TIMEOUT } from './helpers.mjs'

function makeService(stateDir, repository, overrides = {}) {
  return new WorktreeService({ get: () => undefined }, {
    stateDir,
    gitTimeoutMs: TIMEOUT,
    worktreeAddTimeoutMs: TIMEOUT,
    layout: 'repo',
    worktreeDir: '.worktrees',
    basePolicy: 'head',
    mode: 'branch',
    setupCommands: [],
    verifyCommand: null,
    setupTimeoutMs: TIMEOUT,
    autoRegisterWorkspace: false,
    autoSession: false,
    recentWorkspace: () => repository,
    ...overrides,
  })
}

/**
 * 清理临时目录。刚被杀掉的进程可能还占着它一小会儿（Windows 上没有「立刻释放」），
 * 重试几次即可；清不掉也不该让一条已经通过的断言变成失败。
 */
function removeEventually(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true })
      return
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
}

test('the recorded baseline is a commit id, never a branch name', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)
    await service.create({ name: 'baseline' })

    const [record] = service.registry.list()
    assert.match(record.baseOid, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/)
    assert.equal(record.baseOid, git(repository, ['rev-parse', 'HEAD']))
    /* 分支名被当成基线时会长成这样。 */
    assert.notEqual(record.baseOid, 'main')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('probing a worktree does not make the main checkout look isolated', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'probe')
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

    const inside = await inspectRepository(target, { timeoutMs: TIMEOUT })
    assert.equal(inside.isWorktree, true)

    /* 30 秒缓存期内立刻问主仓：它不能被检出那份结果顶替。 */
    const main = await inspectRepository(repository, { timeoutMs: TIMEOUT })
    assert.equal(main.isWorktree, false)
    assert.equal(main.root.toLowerCase(), realpathSync(repository).toLowerCase())
    assert.equal(main.headOid, baseOid)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a conflicting apply refuses to touch the source tree', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'conflict')
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

    writeFileSync(join(target, 'a.txt'), 'from worktree\n')
    writeFileSync(join(repository, 'a.txt'), 'from main\n')
    git(repository, ['commit', '-q', '-am', 'main moved on'])

    await assert.rejects(
      () => applyCheckout({ repository, target, baseOid, timeoutMs: TIMEOUT }),
      (error) => error.code === 'apply-conflict',
    )

    /* 旧实现会把冲突标记写进主仓并留下 unmerged 索引。 */
    assert.equal(readFileSync(join(repository, 'a.txt'), 'utf8'), 'from main\n')
    assert.equal(git(repository, ['status', '--porcelain']), '')
    assert.equal(git(repository, ['diff', '--name-only', '--diff-filter=U']), '')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('removing a checkout whose directory is gone still reports success', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'gone')
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

    rmSync(target, { recursive: true, force: true })
    const outcome = await removeCheckout(repository, target, TIMEOUT)
    assert.equal(outcome.removed, true)
    assert.equal(git(repository, ['worktree', 'list', '--porcelain']).includes('gone'), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a failed removal is reported as a failure, never as success', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    /* 一个 Git 不认识、但确实存在的目录：remove 会失败。 */
    const target = join(workspace, 'worktrees', 'residual')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'leftover.txt'), 'still here\n')

    await assert.rejects(
      () => removeCheckout(repository, target, TIMEOUT),
      (error) => error.code === 'git-failed',
    )
    /*
     * 关键：目录还在就不能报成功。旧实现拿 `worktree prune` 的退出码当成功，
     * 而 prune 无事可做时同样返回 0——记录跟着被删，目录永远看不见。
     */
    assert.equal(existsSync(target), true)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a setup command that leaks a grandchild still ends at its timeout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    /* 父进程被杀后，孙进程还会继续持有 stdout/stderr 管道。 */
    writeFileSync(join(workspace, 'leak.cjs'), [
      "const { spawn } = require('node:child_process')",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' })",
      'setTimeout(() => {}, 60000)',
    ].join('\n'))

    const outcome = await Promise.race([
      runCommand('node leak.cjs', { cwd: workspace, timeoutMs: 800 }),
      new Promise((resolve) => { setTimeout(() => resolve('hung'), 20_000).unref?.() }),
    ])

    assert.notEqual(outcome, 'hung', '超时之后进程树没有被收尾：create 会永久挂起')
    assert.equal(outcome.timedOut, true)
    assert.equal(outcome.ok, false)
  } finally {
    removeEventually(workspace)
  }
})

test('a rename counts as one change, not two', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-correct-'))
  try {
    const repository = join(workspace, 'repo')
    const baseOid = makeRepository(repository)
    const target = join(workspace, 'worktrees', 'rename')
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

    git(target, ['mv', 'a.txt', 'b.txt'])
    /* `status -z` 对重命名给两条 NUL 记录（新路径 + 旧路径）。 */
    const status = await readStatus(target, baseOid, TIMEOUT)
    assert.equal(status.dirty, 1)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})
