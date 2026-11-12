/**
 * worktree 的低层 Git 操作。命令本身见 `commands.ts`。
 *
 * 创建分三步，与创建方式（分支 / detached）无关：
 *   1. `worktree add --no-checkout [-b <branch> | --detach] --lock`  只登记，不写工作区文件；
 *   2. `read-tree <base>`                            先发布完整 index；
 *   3. `checkout-index --all --index`                 全量检出，**同时写入 stat 缓存**。
 *
 * 第 3 步的 `--index` 不能省：没有它，index 里的 ctime/mtime/size 全是 0，
 * 之后每一次 `git status` 都要重新读取并哈希工作区里的每个跟踪文件。
 *
 * 列表与删除都以 Git 记录为准：`listCheckouts()` 直接读
 * `git worktree list --porcelain`，插件注册表只补充「谁创建的、基线是什么」。
 */
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rmdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DomainError } from '../shared/errors.ts'
import type { ApplyResult, DiffFile, DiffValue, WorktreeMode } from '../shared/types.ts'
import { Git, asOid, requireOid, type Oid } from './commands.ts'
import { gitOid, gitText, runGit, type GitOptions } from './exec.ts'
import { indexPathOf } from './repository.ts'

/** 单个 worktree 的轻量状态。 */
export interface StatusValue {
  dirty: number
  files: number
  ahead: number
  behind: number
}

/** `git worktree list --porcelain` 的一份解析结果。 */
export interface CheckoutInfo {
  path: string
  headOid: string | null
  branch: string | null
  detached: boolean
  bare: boolean
  locked: boolean
  /** 目录已经不在，Git 认为元数据可回收。 */
  prunable: boolean
}

function baseOptions(cwd: string, timeoutMs: number): GitOptions {
  return { cwd, timeoutMs }
}

/**
 * 逐条数 `status --porcelain=v1 -z` 的条目。
 *
 * 重命名/复制会占**两条** NUL 记录（`XY <新路径>\0<旧路径>\0`），只按 NUL 段计数
 * 会把一个重命名算成两个改动。
 */
function countStatusEntries(output: string): number {
  const parts = output.split('\0')
  let count = 0
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part === undefined || part === '') continue
    count += 1
    const code = part.slice(0, 2)
    if (code.includes('R') || code.includes('C')) index += 1
  }
  return count
}

/**
 * 读状态。`baseOid` 为 null 时（外部创建、注册表里的基线不可信）以 HEAD 为基线：
 * 只统计未提交改动，`ahead`/`behind` 归零，而不是撒谎。
 */
export async function readStatus(path: string, baseOid: Oid | null, timeoutMs: number): Promise<StatusValue> {
  const options = baseOptions(path, timeoutMs)
  const base = baseOid ?? 'HEAD'
  const [status, counts, diff] = await Promise.all([
    runGit(Git.status(), options),
    runGit(Git.revListLeftRight(base), options),
    runGit(Git.changedFiles(base), options),
  ])
  const leftRight = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : []
  const behind = Number.isSafeInteger(leftRight[0]) ? leftRight[0]! : 0
  const ahead = Number.isSafeInteger(leftRight[1]) ? leftRight[1]! : 0
  return {
    dirty: status.code === 0 ? countStatusEntries(status.stdout) : 0,
    files: diff.code === 0 ? countStatusEntries(diff.stdout) : 0,
    ahead,
    behind,
  }
}

interface NumstatEntry {
  path: string
  added: number | null
  removed: number | null
}

/** 解析 `--numstat -z`：普通条目是 `a\tr\tpath`，重命名是 `a\tr\t\0old\0new`。 */
function parseNumstat(output: string): NumstatEntry[] {
  const parts = output.split('\0')
  const entries: NumstatEntry[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!
    if (part === '') continue
    const fields = part.split('\t')
    if (fields.length < 3) continue
    const added = fields[0] === '-' ? null : Number(fields[0])
    const removed = fields[1] === '-' ? null : Number(fields[1])
    let path = fields.slice(2).join('\t')
    if (path === '') {
      /* 重命名：老路径被单独塞进下一个 NUL 段，新路径是再下一个。 */
      i += 1
      path = parts[i + 1] ?? ''
      i += 1
    }
    if (path === '') continue
    entries.push({ path, added, removed })
  }
  return entries
}

export async function readDiff(
  path: string,
  baseOid: Oid | null,
  timeoutMs: number,
  patchLimit = 512 * 1024,
): Promise<DiffValue> {
  const options = baseOptions(path, timeoutMs)
  const base = baseOid ?? 'HEAD'
  const [numstat, patch, untracked] = await Promise.all([
    runGit(Git.numstat(base), options),
    runGit(Git.patch(base), { ...options, maxBytes: patchLimit }),
    runGit(Git.untracked(), options),
  ])
  const files: DiffFile[] = numstat.code === 0
    ? parseNumstat(numstat.stdout).map((entry) => ({ ...entry, untracked: false }))
    : []
  const untrackedPaths = untracked.code === 0 ? untracked.stdout.split('\0').filter((entry) => entry !== '') : []
  return {
    patch: patch.stdout,
    truncated: patch.truncated,
    files,
    untracked: untrackedPaths,
  }
}

/** `git worktree list --porcelain`：Git 眼里的全部检出，包含主仓自己与外部创建的。 */
export async function listCheckouts(repository: string, timeoutMs: number): Promise<CheckoutInfo[]> {
  const result = await runGit(Git.worktreeList(), baseOptions(repository, timeoutMs))
  if (result.code !== 0) throw new DomainError('git-failed', result.stderr.trim() || 'cannot list worktrees')
  const checkouts: CheckoutInfo[] = []
  let current: CheckoutInfo | null = null
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current !== null) checkouts.push(current)
      /* porcelain 的 worktree 行**不加引号**：路径里的空格属于路径本身，不能取第二列。 */
      current = {
        path: resolve(line.slice('worktree '.length)),
        headOid: null,
        branch: null,
        detached: false,
        bare: false,
        locked: false,
        prunable: false,
      }
      continue
    }
    if (current === null) continue
    if (line.startsWith('HEAD ')) current.headOid = line.slice('HEAD '.length).trim()
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    else if (line === 'detached') current.detached = true
    else if (line === 'bare') current.bare = true
    else if (line === 'locked' || line.startsWith('locked ')) current.locked = true
    else if (line === 'prunable' || line.startsWith('prunable ')) current.prunable = true
  }
  if (current !== null) checkouts.push(current)
  return checkouts
}

/**
 * 仓库内布局的前置条件：那个目录必须被忽略，否则 `git status` 会把整棵检出算成
 * 未跟踪文件，主仓再也不「干净」。
 *
 * 选择写 `.git/info/exclude` 而不是 `.gitignore`：前者不需要提交、不动用户的历史，
 * 后者会立刻把主仓变成 dirty——和「主仓工作区始终干净」的目标正好相反。
 * 代价是队友看不到这条规则，所以只在仓库内布局、且确实没被任何规则覆盖时才写。
 */
export async function ensureIgnored(input: {
  repository: string
  commonDir: string
  relative: string
  timeoutMs: number
}): Promise<{ added: boolean }> {
  const checked = await runGit(Git.checkIgnored(input.relative), baseOptions(input.repository, input.timeoutMs))
  /* 0 = 已被忽略；1 = 未被忽略；其它 = 命令本身出错，别拿它当「未忽略」。 */
  if (checked.code === 0) return { added: false }
  if (checked.code !== 1) {
    throw new DomainError('git-failed', checked.stderr.trim() || 'check-ignore failed')
  }

  const line = `/${input.relative.replace(/\\/g, '/')}/`
  const file = join(input.commonDir, 'info', 'exclude')
  const existing = await readFile(file, 'utf8').catch(() => '')
  if (existing.split(/\r?\n/).some((entry) => entry.trim() === line)) return { added: false }

  await mkdir(join(input.commonDir, 'info'), { recursive: true })
  await appendFile(file, `\n# dsh git-worktree: isolated checkouts\n${line}\n`, 'utf8')
  return { added: true }
}

export interface CreateCheckoutInput {
  repository: string
  /** 检出根目录（会被递归创建）。 */
  root: string
  target: string
  baseOid: string
  mode: WorktreeMode
  /** branch 模式下的新分支名；detached 模式忽略。 */
  branch: string | null
  reason: string
  timeoutMs: number
}

/** 创建一个已检出的 worktree；失败时尽量把登记和空目录收回。 */
export async function createCheckout(input: CreateCheckoutInput): Promise<void> {
  const base = requireOid(input.baseOid, 'worktree baseline')
  await mkdir(input.root, { recursive: true })
  try {
    /* 独占创建：已存在的目录（哪怕为空）不属于本次尝试。 */
    await mkdir(input.target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DomainError('duplicate-worktree')
    throw error
  }

  let registered = false
  try {
    const result = await runGit(
      Git.worktreeAdd({
        target: input.target,
        base,
        branch: input.mode === 'branch' ? input.branch : null,
        reason: input.reason,
      }),
      baseOptions(input.repository, input.timeoutMs),
    )
    if (result.code !== 0) throw classifyCreateFailure(result.stderr)
    registered = true

    await gitText(Git.readTree(base), baseOptions(input.target, input.timeoutMs))
    /* --index: 把检出结果的 stat 写回 index（见文件头注释）。 */
    await gitText(Git.checkoutIndexAll(), baseOptions(input.target, input.timeoutMs))
    await gitText(Git.worktreeUnlock(input.target), baseOptions(input.repository, input.timeoutMs))
  } catch (error) {
    await rollback(input.repository, input.target, registered, input.timeoutMs)
    throw error
  }
}

/** 「分支已存在」和「目录已被登记」是两种不同的用户错误，别混成一个。 */
function classifyCreateFailure(stderr: string): DomainError {
  const text = stderr.trim()
  if (/already exists/i.test(text) && /branch/i.test(text)) return new DomainError('duplicate-branch', text)
  if (/already (registered|checked out)|is a working tree/i.test(text)) return new DomainError('duplicate-worktree', text)
  return new DomainError('git-failed', text || 'worktree add failed')
}

async function rollback(repository: string, target: string, registered: boolean, timeoutMs: number): Promise<void> {
  if (registered) {
    /* 两个 --force：一个忽略脏工作区，一个忽略 lock。 */
    await runGit(Git.worktreeRemove(target), baseOptions(repository, timeoutMs)).catch(() => undefined)
  }
  /* rmdir 只删空目录：非空残留属于调用方，绝不静默删除。 */
  await rmdir(target).catch(() => undefined)
}

export interface RemoveOutcome {
  removed: true
  /** 目录本来就不在，只清了 Git 的登记。 */
  prunedOnly: boolean
}

/**
 * 删除检出。
 *
 * **目录还在就不是成功**。曾经的实现是「remove 失败 → 跑一次 `worktree prune`，
 * 它的退出码是 0 就算成功」；而 `prune` 无事可做时同样返回 0，于是 Windows 上
 * 文件被占用、`remove` 返回 255 的情况下，插件报「已删除」并顺手删掉记录——
 * 目录留在磁盘上，Git 不再列它，面板也再也看不见它。
 */
export async function removeCheckout(repository: string, target: string, timeoutMs: number): Promise<RemoveOutcome> {
  const result = await runGit(Git.worktreeRemove(target), baseOptions(repository, timeoutMs))
  if (result.code === 0) return { removed: true, prunedOnly: false }

  if (!existsSync(target)) {
    /* 目录确实已经不在：清掉 Git 的失效登记即可，不算失败。 */
    await runGit(Git.worktreePrune(), baseOptions(repository, timeoutMs))
    return { removed: true, prunedOnly: true }
  }

  throw new DomainError(
    'git-failed',
    `cannot remove ${target}: ${result.stderr.trim() || `exit ${result.code}`}` +
      '（目录仍在磁盘上：关掉占用它的程序后重试，没有任何记录被删除）',
  )
}

export interface Snapshot {
  /** 快照提交；工作区干净时就是 HEAD。 */
  oid: Oid | null
  /** 工作区有未提交改动（快照是为它造的）。 */
  dirty: boolean
}

/**
 * 给检出的当前内容留一个快照提交。
 *
 * `commit-tree` 直接造对象：**不移动 HEAD、不移动分支、不触发 hooks**。
 * 旧实现用 `git commit`，在分支模式下一按「应用」就往用户分支塞一个
 * `dsh worktree snapshot` 提交，用户 push 时会把它带上。
 *
 * index 在前后被还原，所以这个函数对检出是只读的（除了对象库里多一个提交）。
 */
async function snapshotWorktree(worktree: GitOptions, message: string): Promise<Snapshot> {
  const head = await runGit(Git.headOid(), worktree)
  const headOid = head.code === 0 ? asOid(head.stdout.trim()) : null
  const status = await runGit(Git.status(), worktree)
  if (status.code !== 0 || status.stdout === '') return { oid: headOid, dirty: false }

  const index = await indexPathOf(worktree.cwd, worktree.timeoutMs)
  const backup = index === null ? null : await readFile(index).catch(() => null)
  try {
    await gitText(Git.addAll(), worktree)
    const tree = await gitText(Git.writeTree(), worktree)
    const oid = await gitOid(Git.commitTree(tree, headOid, message), worktree, 'snapshot')
    return { oid, dirty: true }
  } finally {
    if (index !== null && backup !== null) await writeFile(index, backup).catch(() => undefined)
  }
}

/**
 * 把检出内容钉到 `refs/dsh/archive/<id>`。
 *
 * 删除前的最后一道保险：detached 检出里的提交以及任何未提交改动，否则会随
 * `git worktree remove --force` 一起变成不可达对象。引用本身不进分支列表，
 * `git gc` 也不会回收它。
 *
 * 失败一律抛错——「做不到归档」和「没东西可归档」必须能被调用方区分开，
 * 否则强制删除会在没有任何保险的情况下继续。
 */
export async function archiveCheckout(input: {
  repository: string
  target: string
  id: string
  timeoutMs: number
}): Promise<Oid> {
  const worktree = baseOptions(input.target, input.timeoutMs)
  const snapshot = await snapshotWorktree(worktree, `dsh worktree archive ${new Date().toISOString()}`)
  if (snapshot.oid === null) throw new DomainError('git-failed', 'nothing to archive: the checkout has no commit')

  const ref = 'refs/dsh/archive/' + input.id.replace(/[^A-Za-z0-9._-]/g, '')
  const updated = await runGit(Git.updateRef(ref, snapshot.oid), baseOptions(input.repository, input.timeoutMs))
  if (updated.code !== 0) {
    throw new DomainError('git-failed', `cannot pin ${ref}: ${updated.stderr.trim() || `exit ${updated.code}`}`)
  }
  return snapshot.oid
}

/** `git apply` 的冲突行只出现在 stderr，退出码照样是 0：这里把文件名单抠出来。 */
function conflictPaths(stderr: string): string[] {
  const found = new Set<string>()
  const pattern = /Applied patch to '([^']+)' with conflicts/g
  let match = pattern.exec(stderr)
  while (match !== null) {
    found.add(match[1]!)
    match = pattern.exec(stderr)
  }
  return [...found]
}

/**
 * 把检出的净改动应用回主仓工作区（不提交）。
 *
 * 顺序：
 *   1. 给检出内容造快照（不移动分支），以 `base...快照` 生成补丁——三点 diff，
 *      等价于「从分叉点算起」，检出 rebase / 拉过上游之后也不会把别人的提交
 *      算成本检出的删除；
 *   2. **严格预演**：不带 `--3way` 的 `apply --check` 过了，就直接严格应用。
 *      严格模式是原子的：失败即一个字节不动；
 *   3. 严格预演不过才退到 `--3way` 预演，并**显式拒绝** stderr 里的冲突——
 *      `apply --check --3way` 在有冲突时退出码依然是 0，只看退出码等于没检查。
 *
 * 这三步之后，真正的 apply 只可能因为「预演与执行之间工作区被改」而失败。
 */
export async function applyCheckout(input: {
  repository: string
  target: string
  baseOid: Oid
  timeoutMs: number
}): Promise<ApplyResult> {
  const worktree = baseOptions(input.target, input.timeoutMs)
  const repo = baseOptions(input.repository, input.timeoutMs)

  const before = await runGit(Git.status(), worktree)
  const ahead = await runGit(Git.revListLeftRight(input.baseOid), worktree)
  const commitsAhead = ahead.code === 0 ? Number(ahead.stdout.trim()) || 0 : 0
  if (before.code === 0 && before.stdout.trim() === '' && commitsAhead === 0) {
    return { applied: true, files: 0, snapshotOid: null }
  }

  const snapshot = await snapshotWorktree(worktree, `dsh worktree snapshot ${new Date().toISOString()}`)
  if (snapshot.oid === null) throw new DomainError('git-failed', 'the worktree has no commit to diff against')
  const snapshotOid = snapshot.dirty ? snapshot.oid : null

  const patch = await runGit(Git.binaryPatch(input.baseOid, snapshot.oid), {
    ...worktree,
    maxBytes: 32 * 1024 * 1024,
  })
  if (patch.code !== 0) throw new DomainError('git-failed', patch.stderr.trim() || 'cannot build the patch')
  if (patch.stdout.trim() === '') return { applied: true, files: 0, snapshotOid }
  if (patch.truncated) throw new DomainError('too-large', 'the patch exceeds the 32 MiB limit')

  const binary = Buffer.from(patch.stdout, 'utf8')

  const strict = await runGit(Git.applyCheck(false), { ...repo, input: binary })
  const merge = strict.code !== 0
  if (merge) {
    const preflight = await runGit(Git.applyCheck(true), { ...repo, input: binary })
    if (preflight.code !== 0) {
      throw new DomainError('apply-conflict', preflight.stderr.trim() || 'the patch does not apply cleanly')
    }
    const conflicts = conflictPaths(preflight.stderr)
    if (conflicts.length > 0) {
      throw new DomainError(
        'apply-conflict',
        `冲突文件：${conflicts.join(', ')}。主仓没有被修改——先在检出里解决，或把它合并到你的分支。`,
      )
    }
  }

  const applied = await runGit(Git.apply(merge), { ...repo, input: binary })
  if (applied.code !== 0) {
    /* 预演都过了还失败 = 工作区在预演与执行之间被改过。报出它现在的样子。 */
    const state = await runGit(Git.statusText(), repo)
    const detail = state.code === 0 && state.stdout.trim() !== ''
      ? `\n主仓当前状态：\n${state.stdout.trim().split(/\r?\n/).slice(0, 20).join('\n')}`
      : ''
    throw new DomainError(
      'apply-conflict',
      `${applied.stderr.trim() || `git apply exited with ${applied.code}`}${detail}`,
    )
  }

  const files = patch.stdout.split(/\r?\n/).filter((line) => line.startsWith('diff --git ')).length
  return { applied: true, files, snapshotOid }
}

/** 删除前需要知道的全部事实。 */
export interface RemovalInspection {
  missing: boolean
  dirty: number
  ahead: number
  /**
   * 有新提交，且除检出自己检出的那个分支之外，没有任何本地/远端分支包含它。
   * 这是 `--force` 的唯一理由：删除后这些提交只能从归档引用里找回。
   */
  atRisk: boolean
  /** `atRisk` 是因为查询失败而得出的「不敢说安全」，不是真的查到了孤立提交。 */
  uncertain: boolean
  branch: string | null
  headOid: string | null
}

/** 分支引用里哪些「算这个检出自己」——同名分支不构成「已落地」的证据。 */
function ownRefs(branch: string | null): Set<string> {
  const refs = new Set<string>()
  if (branch !== null) refs.add('refs/heads/' + branch)
  return refs
}

/**
 * 删除前检查「这一删会丢什么」。
 *
 * - 目录已不存在：只差一条记录，不算有工作；
 * - 未提交 / 未跟踪：dirty；
 * - 有新提交：再确认除自己分支外的任一本地/远端分支是否已包含它，否则 atRisk。
 *
 * 查询失败时**按有风险处理**：这是唯一一处「宁可信其有」的地方。以前把失败
 * 塞成 `['?']` 占位，于是 `atRisk = false`——查不到就放行删除。
 */
export async function inspectRemoval(input: {
  repository: string
  target: string
  baseOid: Oid | null
  timeoutMs: number
}): Promise<RemovalInspection> {
  if (!existsSync(input.target)) {
    return { missing: true, dirty: 0, ahead: 0, atRisk: false, uncertain: false, branch: null, headOid: null }
  }
  const options = baseOptions(input.target, input.timeoutMs)
  const status = await readStatus(input.target, input.baseOid, input.timeoutMs)
  const ref = await runGit(Git.currentBranch(), options)
  const branch = ref.code === 0 && ref.stdout.trim() !== '' ? ref.stdout.trim() : null
  const head = await runGit(Git.headOid(), options)
  const headOid = head.code === 0 ? head.stdout.trim() : null

  if (status.ahead === 0 || headOid === null) {
    return { missing: false, dirty: status.dirty, ahead: 0, atRisk: false, uncertain: false, branch, headOid }
  }

  const containers = await runGit(Git.forEachRefContaining(headOid), baseOptions(input.repository, input.timeoutMs))
  if (containers.code !== 0) {
    return { missing: false, dirty: status.dirty, ahead: status.ahead, atRisk: true, uncertain: true, branch, headOid }
  }
  const own = ownRefs(branch)
  const elsewhere = containers.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name !== '' && !own.has(name))
  return {
    missing: false,
    dirty: status.dirty,
    ahead: status.ahead,
    atRisk: elsewhere.length === 0,
    uncertain: false,
    branch,
    headOid,
  }
}

/** 操作期间持有 Git 级锁，挡住另一个进程/sweep 的并发删除。已锁定时返回 false。 */
export async function lockCheckout(
  repository: string,
  target: string,
  reason: string,
  timeoutMs: number,
): Promise<boolean> {
  const result = await runGit(Git.worktreeLock(target, reason), baseOptions(repository, timeoutMs))
  return result.code === 0
}

export async function unlockCheckout(repository: string, target: string, timeoutMs: number): Promise<void> {
  await runGit(Git.worktreeUnlock(target), baseOptions(repository, timeoutMs)).catch(() => undefined)
}
