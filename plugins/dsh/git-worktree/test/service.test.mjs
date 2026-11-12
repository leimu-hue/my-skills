/**
 * 编排层：用假 `ctx` 直接驱动 WorktreeService。
 *
 * 覆盖隔离检测、两种创建方式、仓库内布局的忽略规则、外部检出的只读身份、
 * 删除前的风险判定与强制删除的快照保险。Host 专属服务（workspaceRegistry 等）
 * 用假 `ctx` 注入，只在对应动作里被 `ctx.get()` 探测。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorktreeService } from '../dist/host/worktree/service.js'
import { createCheckout } from '../dist/host/git/worktree.js'
import { git, makeRepository, TIMEOUT } from './helpers.mjs'

function makeService(stateDir, repository, overrides = {}, ctx = { get: () => undefined }) {
  return new WorktreeService(ctx, {
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

test('state / create / diff / apply / remove', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)

    const initial = await service.state()
    assert.equal(initial.repository.root, realpathSync(repository))
    assert.deepEqual(initial.worktrees, [])
    assert.equal(initial.repositories.length, 1)
    assert.equal(initial.isolation.inWorktree, false)
    assert.equal(initial.layout, 'repo')

    const created = (await service.create({ name: 'feature' })).worktree
    assert.equal(created.state, 'ready')
    assert.equal(created.dirty, 0)
    assert.equal(created.origin, 'managed')
    assert.equal(created.branch, 'worktree/feature')
    assert.equal(created.mode, 'branch')
    assert.equal(created.path, join(realpathSync(repository), '.worktrees', 'feature'))
    assert.equal(readFileSync(join(created.path, 'a.txt'), 'utf8'), 'hello\n')

    /* 主仓保持干净：检出目录被写进 .git/info/exclude。 */
    assert.equal(git(repository, ['status', '--porcelain']), '')
    assert.match(readFileSync(join(repository, '.git', 'info', 'exclude'), 'utf8'), /\.worktrees\//)

    /* 同名再建：拒绝。 */
    await assert.rejects(() => service.create({ name: 'feature' }), (error) => error.code === 'duplicate-worktree')

    writeFileSync(join(created.path, 'a.txt'), 'changed\n')
    const dirty = await service.view(created.id, true)
    assert.equal(dirty.dirty, 1)
    assert.equal(dirty.files, 1)

    const diff = await service.diff(created.id)
    assert.match(diff.patch, /\+changed/)

    /* 有改动时默认删除被拒绝。 */
    await assert.rejects(() => service.remove(created.id), (error) => error.code === 'worktree-dirty')

    const applied = await service.apply(created.id)
    assert.equal(applied.files, 1)
    assert.equal(readFileSync(join(repository, 'a.txt'), 'utf8'), 'changed\n')

    /* 应用后检出里多了一个快照提交，主仓工作区仍然是未提交改动。 */
    const removed = await service.remove(created.id, { force: true })
    assert.equal(removed.branch, 'worktree/feature')
    assert.deepEqual(service.registry.list(), [])
    /* 分支保留：分支模式的价值就是「删掉检出不会丢工作」。 */
    assert.notEqual(git(repository, ['branch', '--list', 'worktree/feature']), '')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('creation is refused when the directory is already a linked worktree', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)
    const created = (await service.create({ name: 'first' })).worktree

    /* 从检出目录里再发起创建：必须原样返回「已经在隔离里」。 */
    const nested = await service.create({ repository: created.path, name: 'nested' })
    assert.equal(nested.created, false)
    assert.equal(nested.reason, 'already-isolated')
    assert.equal(nested.worktree.id, created.id)
    assert.equal(existsSync(join(created.path, '.worktrees')), false)

    /* 面板的隔离检测读数也指向同一个检出。 */
    const state = await makeService(join(workspace, 'state-2'), created.path).state()
    assert.equal(state.isolation.inWorktree, true)
    assert.equal(state.isolation.path, created.path)
    assert.equal(state.isolation.mainRoot, realpathSync(repository))
    assert.equal(state.repository.root, realpathSync(repository))
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('submodules are normal checkouts, not existing isolation', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const inner = join(workspace, 'inner')
    makeRepository(inner)
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    git(repository, ['-c', 'protocol.file.allow=always', 'submodule', 'add', inner, 'nested'])
    git(repository, ['commit', '-q', '-m', 'add submodule'])

    const submodule = join(repository, 'nested')
    const service = makeService(join(workspace, 'state'), submodule)
    const state = await service.state()
    /* submodule 里 GIT_DIR != GIT_COMMON，但它不是「已经在隔离工作区里」。 */
    assert.equal(state.isolation.inSubmodule, true)
    assert.equal(state.isolation.inWorktree, false)
    assert.equal(state.repository.root, realpathSync(submodule))
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('invalid names and missing worktrees fail with stable codes', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)

    await assert.rejects(() => service.create({ name: '../escape' }), (error) => error.code === 'invalid-name')
    await assert.rejects(() => service.view('missing'), (error) => error.code === 'unknown-worktree')
    await assert.rejects(() => service.diff('missing'), (error) => error.code === 'unknown-worktree')
    await assert.rejects(() => service.remove('missing'), (error) => error.code === 'unknown-worktree')
    await assert.rejects(() => service.remove('external:abc'), (error) => error.code === 'worktree-external')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a directory outside a repository cannot become the current one', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const plain = join(workspace, 'plain')
    mkdirSync(plain, { recursive: true })
    const service = makeService(join(workspace, 'state'), plain)

    const state = await service.state()
    assert.equal(state.repository, null)
    assert.deepEqual(state.worktrees, [])
    assert.equal(state.isolation.inWorktree, false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 创建后的激活：工作区标题带 worktree 标注，会话的 cwd 就是检出目录。 */
test('create registers a labelled workspace and starts a session inside the checkout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const createdWorkspaces = []
    const agentCalls = []
    const ctx = {
      get: (name) => {
        if (name === 'workspaceRegistry') {
          return {
            list: () => createdWorkspaces,
            create: async (path, title) => {
              const record = { id: 'ws-' + (createdWorkspaces.length + 1), path, title }
              createdWorkspaces.push(record)
              return record
            },
          }
        }
        if (name === 'agents') {
          return { create: async (options) => { agentCalls.push(options); return {} } }
        }
        return undefined
      },
    }
    const service = makeService(join(workspace, 'state'), repository, {
      autoRegisterWorkspace: true,
      autoSession: true,
    }, ctx)

    const result = await service.create({ name: 'auto' })
    assert.equal(result.created, true)
    assert.equal(result.workspaceId, 'ws-1')
    assert.equal(typeof result.sessionId, 'string')
    /* 侧栏标签就是「仓库 · 分支」：一眼看出这是隔离检出。 */
    assert.equal(createdWorkspaces[0].title, 'repo · worktree/auto')
    assert.equal(createdWorkspaces[0].path, result.worktree.path)
    /* 会话的 cwd 是检出目录，工作区会按 cwd 把它归组。 */
    assert.equal(agentCalls.length, 1)
    assert.equal(agentCalls[0].meta.cwd, result.worktree.path)
    assert.equal(agentCalls[0].sessionId, result.sessionId)

    /* 已有检出也可以显式再开一个会话。 */
    const later = await service.newSession(result.worktree.id)
    assert.equal(typeof later.sessionId, 'string')
    assert.equal(agentCalls.length, 2)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 没有工作区注册表 / agent 工厂时只降级，不报错。 */
test('activation degrades silently when the host lacks workspaces or agents', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository, {
      autoRegisterWorkspace: true,
      autoSession: true,
    })

    const result = await service.create({ name: 'plain-host' })
    assert.equal(result.created, true)
    assert.equal(result.workspaceId, null)
    assert.equal(result.sessionId, null)
    assert.notEqual(result.sessionError, undefined)
    assert.equal((await service.newSession(result.worktree.id)).sessionId, null)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/*
 * 任务是「唤醒一轮」，不是「插一句话」：必须走 followup，而且发不进去也不能让
 * 已经建好的检出失败。
 */
test('a create task wakes the new session; a failed delivery keeps the checkout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const delivered = []
    let supportsFollowup = true
    const ctx = {
      get: (name) => name === 'agents'
        ? {
            create: async () => (supportsFollowup
              ? { agent: { followup: (message) => delivered.push(message) } }
              : {}),
          }
        : undefined,
    }
    const service = makeService(join(workspace, 'state'), repository, { autoSession: true }, ctx)

    const result = await service.create({ name: 'tasked', task: '  修一下登录超时\n第二行  ' })
    assert.equal(result.created, true)
    assert.equal(result.taskError, undefined)
    assert.equal(typeof result.sessionId, 'string')
    assert.equal(delivered.length, 1)
    /* 模型看到的就是一段普通用户文本：role / source / content 都对得上。 */
    assert.equal(delivered[0].role, 'user')
    assert.deepEqual(delivered[0].source, { kind: 'user' })
    assert.deepEqual(delivered[0].content, [{ type: 'text', text: '修一下登录超时\n第二行' }])
    assert.equal(typeof delivered[0].id, 'string')
    /* 会话日志按值抓取消息，冻结是那条契约的一部分。 */
    assert.equal(Object.isFrozen(delivered[0]), true)
    assert.equal(Object.isFrozen(delivered[0].content[0]), true)

    /* 2) 拿不到 handle：会话建好了，任务只能报出来。 */
    supportsFollowup = false
    const degraded = await service.create({ name: 'degraded', task: '随便做点什么' })
    assert.equal(degraded.created, true)
    assert.equal(typeof degraded.sessionId, 'string')
    assert.equal(typeof degraded.taskError, 'string')
    assert.equal((await service.listFor(repository)).length, 2)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a new worktree carries the files .worktreeinclude names', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    writeFileSync(join(repository, '.gitignore'), '.env\nsecrets/\nignored.txt\n')
    writeFileSync(join(repository, '.worktreeinclude'), '.env\nsecrets/\n')
    git(repository, ['add', '.gitignore', '.worktreeinclude'])
    git(repository, ['commit', '-q', '-m', 'ignore'])
    writeFileSync(join(repository, '.env'), 'TOKEN=1\n')
    mkdirSync(join(repository, 'secrets'))
    writeFileSync(join(repository, 'secrets', 'key.pem'), 'KEY\n')
    writeFileSync(join(repository, 'ignored.txt'), 'no\n')
    writeFileSync(join(repository, 'plain.txt'), 'no\n')

    const service = makeService(join(workspace, 'state'), repository)
    const result = await service.create({ name: 'with-include' })

    assert.deepEqual([...result.copied].sort(), ['.env', 'secrets/key.pem'])
    assert.equal(readFileSync(join(result.worktree.path, '.env'), 'utf8'), 'TOKEN=1\n')
    assert.equal(readFileSync(join(result.worktree.path, 'secrets', 'key.pem'), 'utf8'), 'KEY\n')
    /* 被忽略但没写进 include，以及普通 untracked，都不该被带过去。 */
    assert.equal(existsSync(join(result.worktree.path, 'ignored.txt')), false)
    assert.equal(existsSync(join(result.worktree.path, 'plain.txt')), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('setup and verify commands run inside the new checkout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository, {
      setupCommands: ['node -e "require(\'fs\').writeFileSync(\'setup.txt\', process.cwd())"'],
      verifyCommand: 'node -e "process.exit(require(\'fs\').existsSync(\'setup.txt\') ? 0 : 1)"',
    })
    const result = await service.create({ name: 'configured' })
    assert.equal(result.commands.length, 2)
    assert.equal(result.commands[0].kind, 'setup')
    assert.equal(result.commands[0].ok, true)
    assert.equal(result.commands[1].kind, 'verify')
    assert.equal(result.commands[1].ok, true)
    /* 命令的 cwd 是新检出，不是主仓。 */
    const written = readFileSync(join(result.worktree.path, 'setup.txt'), 'utf8')
    assert.equal(written.toLowerCase(), result.worktree.path.toLowerCase())
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a failing setup command is reported without undoing the checkout', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository, {
      setupCommands: ['node -e "process.exit(3)"', 'node -e "process.exit(0)"'],
      verifyCommand: 'node -e "process.exit(0)"',
    })
    const result = await service.create({ name: 'broken-setup' })
    assert.equal(result.created, true)
    assert.equal(result.commands.length, 1)
    assert.equal(result.commands[0].ok, false)
    assert.equal(result.commands[0].code, 3)
    assert.equal(existsSync(result.worktree.path), true)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 分支模式：提交留在自己的分支上，删检出会被拒绝，强制删除后分支仍在。 */
test('removal refuses commits that no other branch contains', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)
    const created = (await service.create({ name: 'commits' })).worktree

    writeFileSync(join(created.path, 'note.txt'), 'work\n')
    git(created.path, ['add', '-A'])
    git(created.path, ['commit', '-q', '-m', 'work'])

    await assert.rejects(() => service.remove(created.id), (error) => error.code === 'worktree-unpushed')
    const removed = await service.remove(created.id, { force: true })
    assert.equal(removed.branch, 'worktree/commits')
    assert.deepEqual(service.registry.list(), [])
    /* 工作没有丢：分支还在，提交就在。 */
    assert.notEqual(git(repository, ['branch', '--list', 'worktree/commits']), '')
    assert.equal(git(repository, ['log', '-1', '--format=%s', 'worktree/commits']), 'work')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* detached 模式：提交只存在于检出里，强制删除前必须钉成引用。 */
test('force-removing a detached worktree archives its commits', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository, { mode: 'detached' })
    const created = (await service.create({ name: 'scratch' })).worktree
    assert.equal(created.branch, null)
    assert.equal(created.mode, 'detached')

    writeFileSync(join(created.path, 'scratch.txt'), 'work\n')
    git(created.path, ['add', '-A'])
    git(created.path, ['commit', '-q', '-m', 'scratch work'])

    await assert.rejects(() => service.remove(created.id), (error) => error.code === 'worktree-unmerged')
    const removed = await service.remove(created.id, { force: true })
    assert.notEqual(removed.archivedOid, null)
    /* 引用指向那个提交：对象可达，不会被 gc 回收。 */
    assert.equal(git(repository, ['cat-file', '-t', removed.archivedOid]), 'commit')
    assert.match(git(repository, ['show-ref', 'refs/dsh/archive/' + created.id]), /refs\/dsh\/archive\//)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 外部创建的检出只读展示：能看见，不能删。 */
test('worktrees created outside the plugin are listed but never removed', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const outside = join(workspace, 'manual')
    git(repository, ['worktree', 'add', '--detach', outside, 'HEAD'])

    const service = makeService(join(workspace, 'state'), repository)
    const state = await service.state()
    const external = state.worktrees.find((view) => view.origin === 'external')
    assert.notEqual(external, undefined)
    assert.equal(external.path, realpathSync(outside))
    assert.equal(external.id.startsWith('external:'), true)
    assert.equal(external.state, 'ready')

    await assert.rejects(() => service.remove(external.id), (error) => error.code === 'worktree-external')
    assert.equal(existsSync(outside), true)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('the state layout keeps checkouts out of the repository', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const stateDir = join(workspace, 'state')
    const service = makeService(stateDir, repository, { layout: 'state' })
    const created = (await service.create({ name: 'elsewhere' })).worktree
    assert.ok(created.path.startsWith(join(stateDir, 'worktrees')))
    assert.equal(existsSync(join(repository, '.worktrees')), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('an explicit base commit becomes the checkout baseline', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const first = git(repository, ['rev-parse', 'HEAD'])
    writeFileSync(join(repository, 'b.txt'), 'second\n')
    git(repository, ['add', '-A'])
    git(repository, ['commit', '-q', '-m', 'second'])

    const service = makeService(join(workspace, 'state'), repository)
    const result = await service.create({ name: 'from-first', base: first })
    assert.equal(result.worktree.baseOid, first)
    assert.equal(result.worktree.baseBranch, first)
    assert.equal(existsSync(join(result.worktree.path, 'b.txt')), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 目录被外部删掉后，记录可以一次性清理干净。 */
test('prune drops records whose directory is gone', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)
    const created = (await service.create({ name: 'gone' })).worktree

    rmSync(created.path, { recursive: true, force: true })
    assert.equal((await service.view(created.id, true)).state, 'missing')

    const pruned = await service.prune()
    assert.equal(pruned.removed, 1)
    assert.deepEqual(pruned.names, ['gone'])
    assert.deepEqual(service.registry.list(), [])

    /* 再清理一次是安全的空操作。 */
    assert.equal((await service.prune()).removed, 0)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 面板的「工作区」列表取自 Host，而不是插件自己再记一份仓库。 */
test('the workspace list comes from the host registry', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const first = join(workspace, 'first')
    const second = join(workspace, 'second')
    const notes = join(workspace, 'notes')
    const orphan = join(workspace, 'orphan')
    makeRepository(first)
    makeRepository(second)
    makeRepository(orphan)
    mkdirSync(notes, { recursive: true })
    const ctx = {
      get: (name) => name === 'workspaceRegistry'
        ? {
          list: () => [
            { id: '1', path: first, title: 'first' },
            { id: '2', path: second, title: 'second' },
            { id: '3', path: notes, title: 'notes' },
          ],
        }
        : undefined,
    }
    const service = makeService(join(workspace, 'state'), first, {}, ctx)
    const state = await service.state()
    const roots = state.repositories.map((row) => row.root).sort()
    /* 非 Git 工作区与「不是工作区的仓库」都不进列表。 */
    assert.deepEqual(roots, [first, second].sort())
    assert.equal(roots.includes(orphan), false)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 面板只能切到 DSH 工作区：任意目录一律拒绝。 */
test('only DSH workspaces can become the current repository', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const first = join(workspace, 'first')
    const other = join(workspace, 'other')
    makeRepository(first)
    makeRepository(other)
    const ctx = {
      get: (name) => name === 'workspaceRegistry'
        ? { list: () => [{ id: '1', path: first, title: 'first' }] }
        : undefined,
    }
    const service = makeService(join(workspace, 'state'), first, {}, ctx)

    await assert.rejects(service.select(other), (error) => error.code === 'not-a-workspace')
    const state = await service.select(first)
    assert.equal(state.repository.root, first)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 目录被删 + Git 元数据还在（非本插件创建的检出），清理必须能收走。 */
test('prune collects stale checkouts this plugin never created', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const root = join(repository, '.worktrees')
    const target = join(root, 'stale')
    await createCheckout({
      repository,
      root,
      target,
      baseOid: git(repository, ['rev-parse', 'HEAD']),
      mode: 'detached',
      branch: null,
      reason: 'external-probe',
      timeoutMs: TIMEOUT,
    })
    /* 被 lock 住的失效条目 Git 不会 prune：清理必须自己先 unlock。 */
    git(repository, ['worktree', 'lock', '--reason', 'probe', target])
    rmSync(target, { recursive: true, force: true })

    const service = makeService(join(workspace, 'state'), repository)
    const before = await service.state()
    assert.equal(before.worktrees.some((view) => view.state === 'missing'), true)

    const result = await service.prune()
    assert.equal(result.removed, 0)
    assert.equal(result.pruned.length, 1)
    assert.equal(result.pruned[0], target)
    const after = await service.state()
    assert.equal(after.worktrees.length, 0)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

/* 分支前缀是面板设置，不是代码常量：改完下一次创建立即生效。 */
test('the branch prefix setting names new branches', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-service-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = makeService(join(workspace, 'state'), repository)

    await service.setBranchPrefix('feat/')
    const created = await service.create({ name: 'prefix' })
    assert.equal(created.worktree.branch, 'feat/prefix')
    assert.equal(service.branchPrefix, 'feat/')

    /* 空串合法：分支名直接用名字。 */
    await service.setBranchPrefix('')
    const bare = await service.create({ name: 'plain' })
    assert.equal(bare.worktree.branch, 'plain')

    /* Git 的引用规则由 git 自己判：空格、'..' 之类一律拒绝。 */
    await assert.rejects(service.setBranchPrefix('bad prefix/'), (error) => error.code === 'invalid-layout')
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})
