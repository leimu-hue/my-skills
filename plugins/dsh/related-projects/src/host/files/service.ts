/**
 * 关联项目内部的文件与目录，供输入框的 `@` 菜单使用。
 *
 * 自带的文件源只能搜索 Agent 的工作目录——关联项目则是该工作区
 * *之外* 的同级目录，所以它的文件在那里根本不可见。
 *
 * 索引的设计对齐 DSH 自带的 `@` 文件补全（`dsh-file-reference-local` 的
 * `WorkspaceFileSearch`），差别只在「一个项目一份」而不是「一个工作区一份」：
 *
 *   search  — 裸查询：在**有界索引**里按「名字 → 路径 → 子序列」打分。
 *             索引只有一个预算（`maxEntries`），先进先出地遍历，所以先浅后深；
 *             **没有深度上限**，深目录只是排在队尾，不会被整层丢掉。
 *   list    — 带 `/` 的查询（下钻）与逐层进入都**不读索引**，直接读那一层，
 *             因此再深的目录也永远进得去。
 *
 * 索引会过期，但不阻塞输入框：过期条目继续作答，重建在后台进行
 * （见 `indexFor`）。失效来自工具结果（`host/index.ts` 订阅 `session/event`），
 * 另有一条兜底的定时刷新——用户在 IDE 里新增的文件没有工具结果可触发。
 */
import { readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { absoluteOf, isInside, relativeTo, workspaceKey } from '../shared/paths.js'
import type { FileHit } from '../shared/types.js'

/** 菜单可搜索的一个项目，以注册表的视角表示。 */
export interface ProjectRoot {
  path: string
  name: string
}

/** 搜索的预算与排除清单；与自带文件补全的配置项同名同义。 */
export interface FileSearchConfig {
  /** 一次查询最多给出行数。 */
  maxResults: number
  /** 一份索引最多留多少条目——唯一的预算，没有深度上限。 */
  maxEntries: number
  /** 永不遍历的目录名（basename），与自带清单保持一致。 */
  excludedDirectories: readonly string[]
}

export const DEFAULT_FILE_SEARCH_MAX_RESULTS = 20
export const DEFAULT_FILE_SEARCH_MAX_ENTRIES = 50_000

/**
 * 内容永远不值得从菜单里搜索的目录：版本库、依赖库，以及没有任何生态
 * 会拿它放源码的构建目录。
 *
 * 刻意缺席的两种：
 *   `lib`   —— Ruby gem 与不少 npm 包把源码放在那里，排除掉会让 `@` 悄悄漏掉；
 *   点开头 —— 不在这里，由 `visibleForQuery` 隐藏（大多数是元数据），只有
 *             查询本身以 `.` 开头时才出现。
 */
export const DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: readonly string[] = [
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'target',
  '.next', '.nuxt', '.turbo', '.venv', '__pycache__', '.pytest_cache',
  '.mypy_cache', '.gradle',
]

/**
 * 兜底刷新间隔。索引失效的常规来源是工具结果；用户在自己 IDE 里改文件时
 * 没有事件可听，所以过期超过这个间隔的索引会在下一次查询时后台重建。
 */
const REFRESH_AFTER_MS = 15_000

/** 索引里的一条：相对项目根的路径、末段名字、种类。 */
interface Entry {
  rel: string
  name: string
  /** 预折叠的小写形式：每次按键都要用，不能在每个条目上重新分配。 */
  lower: string
  lowerName: string
  kind: FileHit['kind']
  /** 路径里有以 `.` 开头的段：普通查询不展示它。 */
  hidden: boolean
}

/** 一次查询的解析结果：原文、小写形式，以及它是否明确点了点目录。 */
interface Needle {
  text: string
  lower: string
  dot: boolean
}

/** 搜索结果：行本身 + 排序用的分数（分数不会离开本模块）。 */
interface RankedHit extends FileHit {
  score: number
}

/** 一份建好的索引；`startedAt` 记下它开工时的失效计数。 */
interface Settled {
  entries: Entry[]
  startedAt: number
  settledAt: number
}

/** 一次正在进行的遍历；同一项目同一时刻只有一份。 */
interface Generation {
  controller: AbortController
  promise: Promise<Entry[]>
}

/** 一层目录的答案：行 + 是否被行数上限截断。 */
interface DirectoryListing {
  rows: FileHit[]
  truncated: boolean
}

function defaultFileSearchConfig(): FileSearchConfig {
  return {
    maxResults: DEFAULT_FILE_SEARCH_MAX_RESULTS,
    maxEntries: DEFAULT_FILE_SEARCH_MAX_ENTRIES,
    excludedDirectories: DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES,
  }
}

/* ------------------------------- 小工具 ------------------------------- */

/** 拼接项目内的相对路径；两种写法都只到这里。 */
function joinRel(parent: string, name: string): string {
  return parent === '' ? name : parent + '/' + name
}

/** 与平台无关的字典序：只用于让结果确定，不用于展示。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** 同分时目录先于文件（与自带的排序一致）。 */
function kindRank(kind: FileHit['kind']): number {
  return kind === 'directory' ? 0 : 1
}

function clampLimit(limit: number | undefined, max: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return max
  return Math.min(Math.max(Math.floor(limit), 1), max)
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('file search aborted')
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal !== undefined && signal.aborted) throw abortError(signal)
}

/** 只在调用方自己的 signal 上放弃等待，不牵连同项目的其他查询。 */
function waitFor<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then((value) => {
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }, (error: unknown) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}

/**
 * 一条候选的分数：名字精确 > 名字前缀 > 名字子串 > **路径**子串 > 子序列模糊。
 *
 * 路径那一档是 `@` 菜单真正的容错：只记得半条路径（`controller/external`）
 * 或记不全名字（`ExTskCtl`）都要能命中；而名字优先保证同名目录抢不走
 * 精确输入的第一行。
 */
function scoreOf(entry: Entry, needle: Needle): number | undefined {
  const name = entry.lowerName
  const query = needle.lower
  const bonus = entry.kind === 'directory' ? 25 : 0
  if (name === query) return 1000 + bonus
  if (name.startsWith(query)) return 900 + bonus
  if (name.includes(query)) return 700 + bonus
  if (entry.lower.includes(query)) return 500 + bonus
  const fuzzy = subsequenceScore(entry.lower, query)
  return fuzzy === undefined ? undefined : 300 + fuzzy + bonus
}

/** 查询的每个字符按顺序出现就算命中；间隔越小越靠前。 */
function subsequenceScore(target: string, query: string): number | undefined {
  let cursor = 0
  let gap = 0
  for (const character of query) {
    const found = target.indexOf(character, cursor)
    if (found < 0) return undefined
    gap += found - cursor
    cursor = found + 1
  }
  return Math.max(0, 100 - gap)
}

/**
 * 点开头的目录（`.github`、`.kiro`）平时不进候选：它们大多是元数据，
 * 会把真正的源码挤出二十行。用户明确输入 `.` 时才放行。
 */
function visibleForQuery(entry: Entry, needle: Needle): boolean {
  return !entry.hidden || needle.dot
}

/** 列一层时只看这一项自己的名字，祖先目录是不是点开头由调用方决定。 */
function visibleAtLevel(name: string, needle: string): boolean {
  return !name.startsWith('.') || needle.startsWith('.')
}

/** 排序：分数优先，其次目录，再按路径长度与字典序——完全确定。 */
function byRank(needle: Needle): (left: RankedHit, right: RankedHit) => number {
  return (left, right) => right.score - left.score
    || kindRank(left.kind) - kindRank(right.kind)
    || (needle.text === '' ? 0 : left.rel.length - right.rel.length)
    || compareText(left.rel, right.rel)
}

/** 索引条目 → 菜单行（分数留在模块内）。 */
function fileHit(root: ProjectRoot, entry: Entry): FileHit {
  return {
    path: absoluteOf(root.path, entry.rel),
    rel: entry.rel,
    name: entry.name,
    kind: entry.kind,
    project: root.name,
  }
}

function strip({ score: _score, ...row }: RankedHit): FileHit {
  return row
}

/**
 * 只留能进前 `keep` 名的候选：每次按键都要重跑一遍整个项目，而菜单只要二十行。
 * 周期性收缩——比较器是全序，所以丢掉的那些不可能再追回来。
 */
function offer(
  rows: RankedHit[],
  row: RankedHit,
  keep: number,
  compare: (left: RankedHit, right: RankedHit) => number,
): void {
  rows.push(row)
  if (rows.length < keep * 4) return
  rows.sort(compare)
  rows.length = keep
}

function kindOf(dirent: Dirent, excluded: Set<string>): FileHit['kind'] | null {
  if (dirent.isDirectory()) return excluded.has(dirent.name) ? null : 'directory'
  return dirent.isFile() ? 'file' : null
}

function entryOf(rel: string, name: string, kind: FileHit['kind']): Entry {
  return {
    rel,
    name,
    lower: rel.toLowerCase(),
    lowerName: name.toLowerCase(),
    kind,
    hidden: rel.split('/').some((segment) => segment.startsWith('.')),
  }
}

function needleOf(raw: string): Needle {
  const text = raw.trim()
  return { text, lower: text.toLowerCase(), dot: text.startsWith('.') || text.includes('/.') }
}

function validateConfig(config: FileSearchConfig): void {
  if (!Number.isSafeInteger(config.maxResults) || config.maxResults <= 0) {
    throw new Error('related-projects: file search maxResults must be a positive safe integer')
  }
  if (!Number.isSafeInteger(config.maxEntries) || config.maxEntries <= 0) {
    throw new Error('related-projects: file search maxEntries must be a positive safe integer')
  }
  if (config.excludedDirectories.some((name) => name === '' || name.includes('/') || name.includes('\\'))) {
    throw new Error('related-projects: file search excludedDirectories entries must be non-empty directory basenames')
  }
}

/* --------------------------- 一个项目的索引 --------------------------- */

/**
 * 一个项目根目录上的有界索引，语义对齐自带的 `WorkspaceFileSearch`：
 * 可取消、可复用、过期不阻塞。目录内的查询读实时状态，裸查询共用这一份遍历。
 */
class ProjectFileSearch {
  /** 只用于取显示名与拼绝对路径；名字会改，所以不是 `readonly`。 */
  private root: ProjectRoot
  private readonly config: FileSearchConfig
  private readonly excluded: Set<string>
  private settled: Settled | undefined
  private generation: Generation | undefined
  /** 单调递增的失效计数；低于它的已建索引就是过期的。 */
  private invalidations = 0
  private disposed = false

  constructor(root: ProjectRoot, config: FileSearchConfig) {
    this.root = root
    this.config = config
    this.excluded = new Set(config.excludedDirectories)
  }

  /** 裸查询：在索引里打分。过期索引照常作答，重建在后台跑。 */
  async search(query: string, limit: number | undefined, signal?: AbortSignal): Promise<RankedHit[]> {
    const needle = needleOf(query)
    if (this.disposed || needle.text === '') return []
    checkAborted(signal)
    const entries = await this.indexFor(signal)
    const keep = clampLimit(limit, this.config.maxResults)
    const compare = byRank(needle)
    const rows: RankedHit[] = []
    for (const entry of entries) {
      if (!visibleForQuery(entry, needle)) continue
      const score = scoreOf(entry, needle)
      if (score === undefined) continue
      offer(rows, { ...fileHit(this.root, entry), score }, keep, compare)
    }
    rows.sort(compare)
    return rows.slice(0, keep)
  }

  /**
   * 某一层目录的直接子项：一次下钻，或输入路径里最后一个 `/` 之后的那层。
   * `filter` 是最后一个 `/` 之后输入的文字，同样按「名字 → 路径」打分，
   * 因此空 filter 就是「目录在前、按名字」的平铺一层。
   */
  async list(rel: string, filter: string, limit: number | undefined, signal?: AbortSignal): Promise<DirectoryListing> {
    if (this.disposed) return { rows: [], truncated: false }
    checkAborted(signal)
    if (rel.split('/').some((segment) => this.excluded.has(segment))) return { rows: [], truncated: false }
    let dirents: Dirent[]
    try {
      dirents = await readdir(absoluteOf(this.root.path, rel), { withFileTypes: true })
    } catch {
      return { rows: [], truncated: false } /* 读不了的一层就当空的，绝不让整个菜单失败 */
    }
    checkAborted(signal)
    dirents.sort((left, right) => compareText(left.name, right.name))
    const needle = needleOf(filter)
    const capped = clampLimit(limit, this.config.maxResults)
    const compare = byRank(needle)
    const rows: RankedHit[] = []
    let matched = 0
    for (const dirent of dirents) {
      const kind = kindOf(dirent, this.excluded)
      if (kind === null) continue
      if (!visibleAtLevel(dirent.name, needle.text)) continue
      const entry = entryOf(joinRel(rel, dirent.name), dirent.name, kind)
      const score = needle.text === '' ? 0 : scoreOf(entry, needle)
      if (score === undefined) continue
      matched += 1
      offer(rows, { ...fileHit(this.root, entry), score }, capped, compare)
    }
    rows.sort(compare)
    return { rows: rows.slice(0, capped).map(strip), truncated: matched > capped }
  }

  /** 项目改名了：索引与路径都不变，只有行上的项目名要跟上。 */
  rename(project: ProjectRoot): void {
    this.root = project
  }

  /**
   * 标记过期。旧条目继续作答：一次重建是一整棵树，把它摆在光标前面
   * 正是「每个工具结果都失效一次」时最不该付的代价。
   */
  invalidate(): void {
    this.invalidations += 1
  }

  /** 中止遍历，并让之后的查询返回空。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation?.controller.abort(new Error('file search index disposed'))
    this.generation = undefined
    this.settled = undefined
  }

  /**
   * 裸查询读的那份条目。只有「一份都还没有」才等遍历；已有过期索引就先用它
   * 作答，重建在后台进行。
   */
  private async indexFor(signal?: AbortSignal): Promise<Entry[]> {
    const settled = this.settled
    if (settled === undefined) return waitFor(this.ensureIndex(), signal)
    const stale = settled.startedAt < this.invalidations || Date.now() - settled.settledAt >= REFRESH_AFTER_MS
    if (stale) {
      void this.ensureIndex().catch(() => {
        /* 后台刷新失败不是这次查询的错误：旧条目仍然有效，下一次查询会再试 */
      })
    }
    return settled.entries
  }

  private ensureIndex(): Promise<Entry[]> {
    if (this.generation !== undefined) return this.generation.promise
    const controller = new AbortController()
    const startedAt = this.invalidations
    const generation: Generation = { controller, promise: Promise.resolve([]) }
    generation.promise = this.scan(controller.signal).then((entries) => {
      if (this.disposed) return entries
      if (this.generation === generation) this.generation = undefined
      this.settled = { entries, startedAt, settledAt: Date.now() }
      return entries
    }, (error: unknown) => {
      if (this.generation === generation) this.generation = undefined
      throw error
    })
    this.generation = generation
    return generation.promise
  }

  /**
   * 一遍先进先出的遍历：先浅后深，只有 `maxEntries` 一个预算。
   *
   * 深度不是预算：旧的「最多 12 层」会把 `…/presentation/controller/external/`
   * 这种 Java 包结构整层丢掉，于是贴得最近的源码反而搜不到。
   */
  private async scan(signal: AbortSignal): Promise<Entry[]> {
    const entries: Entry[] = []
    const queue: { absolute: string; rel: string }[] = [{ absolute: this.root.path, rel: '' }]
    for (let cursor = 0; cursor < queue.length && entries.length < this.config.maxEntries; cursor += 1) {
      const directory = queue[cursor]
      if (directory === undefined) break
      checkAborted(signal)
      let dirents: Dirent[]
      try {
        dirents = await readdir(directory.absolute, { withFileTypes: true })
      } catch {
        /* 根目录读不了：让这次遍历失败，旧索引因此不会被一份空表顶掉。 */
        if (cursor === 0) throw new Error('cannot read project root ' + this.root.path)
        continue /* 读不了的子树只损失它自己的候选 */
      }
      checkAborted(signal)
      dirents.sort((left, right) => compareText(left.name, right.name))
      for (const dirent of dirents) {
        if (entries.length >= this.config.maxEntries) break
        const name = dirent.name
        const rel = joinRel(directory.rel, name)
        if (dirent.isDirectory()) {
          if (this.excluded.has(name)) continue
          entries.push(entryOf(rel, name, 'directory'))
          queue.push({ absolute: absoluteOf(directory.absolute, name), rel })
          continue
        }
        if (dirent.isFile()) entries.push(entryOf(rel, name, 'file'))
        /* 符号链接既不跟随（防止成环），也不列出。 */
      }
    }
    return entries
  }
}

/* --------------------------- 全部关联项目 --------------------------- */

/**
 * 注册表里那批关联项目的搜索入口：一个项目一份索引，配置与生命周期都收在
 * 这一处。路由只把它当函数用。
 */
export class FileSearch {
  private readonly config: FileSearchConfig
  private readonly searches = new Map<string, ProjectFileSearch>()
  private disposed = false

  constructor(config: FileSearchConfig = defaultFileSearchConfig()) {
    validateConfig(config)
    this.config = config
  }

  /** 所有项目里命中查询的条目；跨项目按分数合并成一份名单。 */
  async search(projects: ProjectRoot[], query: string, limit?: number, signal?: AbortSignal): Promise<FileHit[]> {
    if (this.disposed) return []
    const needle = needleOf(query)
    if (needle.text === '') return []
    const rows: RankedHit[] = []
    for (const project of projects) {
      checkAborted(signal)
      rows.push(...await this.searchOf(project).search(needle.text, limit, signal))
    }
    rows.sort(byRank(needle))
    return rows.slice(0, clampLimit(limit, this.config.maxResults)).map(strip)
  }

  /** 项目内某层目录的直接子项；不读索引，所以深层目录永远进得去。 */
  async list(
    root: ProjectRoot,
    rel: string,
    filter: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<DirectoryListing> {
    if (this.disposed) return { rows: [], truncated: false }
    return this.searchOf(root).list(rel, filter, limit, signal)
  }

  /** 所有项目的索引一起标记过期（工具结果、外部改动之后）。 */
  invalidate(): void {
    for (const search of this.searches.values()) search.invalidate()
  }

  /**
   * 一个项目不再属于任何工作区：索引连同条目一起放掉。
   *
   * 只由删项目这一件事触发，而不是每次查询都对一遍当前工作区的项目——
   * 请求只带一个工作区，拿它当下结论会误伤别的会话正在用的索引。
   */
  forget(path: string): void {
    const key = workspaceKey(path)
    this.searches.get(key)?.dispose()
    this.searches.delete(key)
  }

  /** 插件卸载：中止所有遍历并放掉条目。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const search of this.searches.values()) search.dispose()
    this.searches.clear()
  }

  private searchOf(project: ProjectRoot): ProjectFileSearch {
    const key = workspaceKey(project.path)
    const existing = this.searches.get(key)
    if (existing !== undefined) {
      existing.rename(project)
      return existing
    }
    const created = new ProjectFileSearch(project, this.config)
    this.searches.set(key, created)
    return created
  }
}

/**
 * 一个下钻目标属于哪个项目，以及它在项目内的位置。越界规则只写在这一处：
 * `list` 请求只能遍历已注册的关联项目，或该项目内部的目录，这样菜单
 * 就没法被用来按外部传入的路径浏览文件系统。
 */
export function directoryTarget(
  projects: ProjectRoot[],
  dir: string,
): { root: ProjectRoot; rel: string } | null {
  for (const project of projects) {
    if (!isInside(project.path, dir)) continue
    const rel = relativeTo(project.path, dir)
    if (rel !== null) return { root: project, rel }
  }
  return null
}
