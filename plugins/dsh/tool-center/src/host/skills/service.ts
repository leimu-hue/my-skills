/**
 * 技能域的服务层：状态、扫描器、写锁与来源集合的唯一持有者。
 *
 * 每个 op 都遵守的契约：
 *   * 读绝不写盘（被替换插件的读路径会排出「要对账」的写，正是审计里那个
 *     每秒两行的死循环的来源）；
 *   * 每个变更在「请求值已经成立」时提前返回（`changed:false`），所以重复调用
 *     既不算也不写；
 *   * 一把锁、一次原子写，然后一次扫描器失效 + 一次 provider 失效（`notifyChanged`）。
 */
import { stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type { SkillManagerState, SkillRoot, SkillRow, SkillStateView, StateLoad } from '../shared/types.js'
import { DomainError, errorResult, type OpResult } from '../shared/result.js'
import { isFile } from '../shared/fs.js'
import { createLock, isInside, pathIdSync, realOrResolved } from '../shared/paths.js'
import type { Scanner } from './scan.js'
import { createScanner } from './scan.js'
import { DEFAULT_RANKS, dedupeRoots, hostRoots, overlapsExisting, projectRootsFor, staticRoots } from './roots.js'
import {
  customRootKey,
  customRootOf,
  defaultStatePath,
  forgetSkillEverywhere,
  loadState,
  pruneState,
  saveState,
  uniqueStrings,
} from './state.js'
import { allRows, buildStateView, liveNameIndex } from './view.js'
import { rowIdOf, rowMatchesRef } from './policy.js'
import { createSkill, readSkillDetail, updateSkill } from './files/authoring.js'
import { deleteSkillToTrash, emptyTrash, listTrash, purgeTrashItem, restoreTrashItem } from './files/trash.js'
import { exportRowAsZip, exportRowsAsZip, importZip, scanZip } from './files/transfer.js'
import { PROVIDER_NAME, createProvider } from './provider.js'

export type { OpResult } from '../shared/result.js'

/**
 * 宿主注册表里的一条候选（用来反推它所在的来源目录）。
 *
 * `docPath` 是文档本身的路径（`.../<skill>/SKILL.md` 或平铺的 `.../x.md`），有它最准；
 * 但 `ctx.skills.list()` 的摘要**只稳定给出 `resourceBase`**（`skillDir`，技能自己的资源
 * 目录），`path` / `locator` 都不在摘要里。两种都给，反推时优先用文档路径。
 */
export interface HostCandidate {
  name: string
  docPath?: string
  /** 宿主的 `resourceBase.path`：bundle 技能是 `<root>/<skill>`，平铺技能就是来源目录本身。 */
  skillDir?: string
}

/**
 * 宿主目录缓存的兜底时效。
 *
 * 正常情况下缓存由宿主的 `skills/change` 事件维护（见 index.ts）：只有注册表真的变了才
 * 重探一次。这个 TTL 只用于「事件没到」（旧宿主 / 监听不到）时在**后台**补一次探测，
 * 它不挡面板读取 —— 进技能页不该为了宿主目录再跑一遍全部 provider。
 */
const HOST_DIRS_TTL = 60_000

/**
 * 探测宿主注册表的最长等待。
 *
 * 注册表背后是别的 provider（可能有远程 / 慢实现），面板不能为它无限转圈：超时就先用
 * 上一次的结果返回，探测在后台继续，下一次读取自然跟上。
 */
const HOST_DIRS_PROBE_TIMEOUT = 1_500

/** 一次读取的选项。 */
export interface ReadOptions {
  /**
   * 是否允许在这次读取里去宿主注册表探一次「宿主发布的目录」（默认允许）。
   *
   * 宿主的 `skills.list()` 会把每个已注册 provider 都问一遍 —— 包括本插件注册的那个，
   * 而 provider 的 `list()` 自己也在读视图。所以 provider 那条路径必须传 `false`：
   * 否则一次读取会在「我们 → 宿主 → 我们 → 宿主」之间无限递归，面板永远停在加载中。
   */
  probeHost?: boolean
}

export interface ServiceOptions {
  dshHome: string
  agentsHome: string
  claudeHome?: string
  codexHome?: string
  builtinDir?: string
  /**
   * 读宿主技能注册表里的候选（ctx.skills.list()）。
   *
   * 用途：找出「宿主已经在发布、但我们没扫」的目录 —— 例如应用自带的官方技能包。
   * 这样来源是**从宿主读出来的**，不是插件猜的路径。
   */
  hostCandidates?: () => Promise<HostCandidate[]>
  /** 写插件日志用的一行（人类可读）。 */
  log?: (event: string, detail: string) => void
  scanner?: Scanner
}

export interface SkillService {
  readonly providerName: string
  readonly statePath: string
  view(cwd?: string, scopeKey?: string, read?: ReadOptions): Promise<SkillStateView>
  roots(cwd?: string, read?: ReadOptions): Promise<SkillRoot[]>
  detail(rootKey: string, name: string, cwd?: string): Promise<OpResult>
  setSkill(rootKey: string, name: string, enabled: boolean, cwd?: string, scopeKey?: string): Promise<OpResult>
  setAll(items: { root: string; name: string }[], enabled: boolean, cwd?: string, scopeKey?: string): Promise<OpResult>
  /**
   * 按快照恢复一批技能的开关（场景回滚用）。
   *
   * 与 `setAll` 的区别：不按当前视图解析行 —— 退出场景时可能没有 cwd，项目来源不在
   * 视图里，而回滚必须按记录把状态改回去。写仍然走同一把锁与同一次失效。
   */
  restoreSkills(items: { root: string; name: string; enabled: boolean }[]): Promise<OpResult>
  setSource(rootKey: string, enabled: boolean, scopeKey?: string, cwd?: string): Promise<OpResult>
  setRemoved(rootKey: string, removed: boolean, cwd?: string): Promise<OpResult>
  prefer(rootKey: string, name: string, preferred: boolean): Promise<OpResult>
  create(rootKey: string, input: { name: string; description: string; body?: string; whenToUse?: string }, cwd?: string): Promise<OpResult>
  update(rootKey: string, name: string, changes: { description?: string; body?: string; whenToUse?: string; name?: string }, cwd?: string): Promise<OpResult>
  remove(rootKey: string, name: string, cwd?: string): Promise<OpResult>
  trashList(): Promise<OpResult>
  trashRestore(id: string): Promise<OpResult>
  trashPurge(id: string): Promise<OpResult>
  trashEmpty(): Promise<OpResult>
  addRoot(path: string, label?: string): Promise<OpResult>
  removeRoot(key: string): Promise<OpResult>
  importZip(rootKey: string, base64: string, cwd?: string, only?: string[]): Promise<OpResult>
  /** 只看不写：列出压缩包里可导入的技能（含「已存在」标记），给面板勾选用。 */
  scanImport(rootKey: string, base64: string, cwd?: string): Promise<OpResult>
  exportZip(selection: { root: string; name: string }[] | undefined, cwd?: string): Promise<OpResult>
  refresh(): Promise<OpResult>
  /**
   * 重新探一次宿主注册表（事件驱动：宿主 `skills/change`、启动、显式 refresh）。
   *
   * 面板读取**不再**每次去问注册表 —— 那是「进技能页卡一下」的来源。缓存由这里维护。
   */
  refreshHostDirs(): Promise<void>
  /** 交给 `ctx.skills.registerProvider` 的 provider 对象。 */
  makeProvider(): ReturnType<typeof createProvider>
  /** 外部改动（watcher）或写操作之后调用：推进扫描代号并让每个 provider 重新 list。 */
  touch(rootKey?: string): void
  /** provider 上线后由宿主登记的失效句柄集合。 */
  readonly invalidators: Set<() => void>
  /** 最近一次状态读取的结果，供兼容 / 健康信息用。 */
  stateInfo(): { origin: StateLoad['origin']; degraded: boolean; warnings: string[] } | undefined
}

/** 把一个技能开关写进状态；返回是否真的改了（幂等短路就在这里）。 */
function applySkillSwitch(state: SkillManagerState, rootKey: string, name: string, enabled: boolean): boolean {
  const hidden = state.hiddenSkills[rootKey] ?? []
  if (hidden.includes(name) === !enabled) return false
  const next = enabled ? hidden.filter((item) => item !== name) : uniqueStrings([...hidden, name])
  if (next.length === 0) delete state.hiddenSkills[rootKey]
  else state.hiddenSkills[rootKey] = next
  return true
}

function reservedScope(): OpResult {
  return {
    ok: false,
    error: '会话/工作区分层作用域已预留但尚未启用（当前只有全局层）。接口已就位，功能待实现。',
    code: 'error.scope.reserved',
  }
}

function unknownRoot(rootKey: string): OpResult {
  return { ok: false, error: `技能来源不存在：${rootKey}`, code: 'error.root.unknown' }
}

function unavailable(name: string): OpResult {
  return { ok: false, error: `技能不存在：${name}`, code: 'error.skill.notFound' }
}

export function createService(options: ServiceOptions): SkillService {
  const statePath = defaultStatePath(options.dshHome)
  const scanner = options.scanner ?? createScanner()
  const lock = createLock()
  const invalidators = new Set<() => void>()
  let cached: StateLoad | undefined
  /** 最近一次探测到的宿主目录（原始目录，未按已知来源过滤）。 */
  let hostDirCache: { at: number; dirs: string[] } | undefined
  /** 正在进行的探测：同一时刻只问注册表一次，并发 / 重入的读取共用它。 */
  let hostDirTask: Promise<void> | undefined

  /** 只在真的发生变更时写（`mutate` 已经保证了这一点）。 */
  const log = (event: string, detail: string): void => {
    try {
      options.log?.(event, detail)
    } catch {
      /* 记日志永远不能弄坏一个 op */
    }
  }

  async function readState(): Promise<StateLoad> {
    const loaded = await loadState(statePath)
    cached = loaded
    return loaded
  }

  /** 变更后的统一收尾：推进扫描代号 + 让每个注册的 provider 重新 list。 */
  function touch(rootKey?: string): void {
    scanner.invalidate(rootKey)
    for (const invalidate of invalidators) {
      try {
        invalidate()
      } catch {
        /* 单个死掉的注册不该拖住其余注册 */
      }
    }
  }

  async function mutate(task: (state: SkillManagerState) => Promise<{ changed: boolean; value?: unknown }>): Promise<OpResult> {
    return lock(async () => {
      const loaded = await readState()
      const state = loaded.state
      let outcome: { changed: boolean; value?: unknown }
      try {
        outcome = await task(state)
      } catch (cause) {
        if (cause instanceof DomainError) return errorResult(cause)
        throw cause
      }
      const value = { ...(outcome.value as object ?? {}) }
      if (!outcome.changed) return { ok: true, data: { ...value, changed: false } }
      await saveState(statePath, state)
      touch()
      return { ok: true, data: { ...value, changed: true } }
    })
  }

  async function rootsFor(cwd?: string, read?: ReadOptions): Promise<SkillRoot[]> {
    const loaded = cached ?? (await readState())
    const base = staticRoots(
      {
        dshHome: options.dshHome,
        agentsHome: options.agentsHome,
        claudeHome: options.claudeHome,
        codexHome: options.codexHome,
        builtinDir: options.builtinDir,
      },
      loaded.state,
    )
    const project = cwd === undefined || cwd === '' ? [] : await projectRootsFor(cwd, loaded.state)
    const { roots } = await dedupeRoots([...project, ...base])
    // 宿主自己发布的目录（不在上面这些来源里的），补成额外来源。
    return [...roots, ...hostRoots(await hostDirsOf(roots, read?.probeHost !== false), loaded.state)]
  }

  /**
   * 问一次宿主注册表，把「宿主发布的目录」记进缓存。
   *
   * 这一次 `skills.list()` 会把本插件注册的 provider 也问一遍，而 provider 的 `list()`
   * 同样要读视图 —— 所以 provider 那条路径传 `probeHost: false`（见 `makeProvider`），
   * 递归最多只有这一层，不会回头再问注册表。
   */
  function refreshHostDirs(): Promise<void> {
    if (options.hostCandidates === undefined) return Promise.resolve()
    if (hostDirTask !== undefined) return hostDirTask
    hostDirTask = (async () => {
      try {
        const candidates = await options.hostCandidates!()
        hostDirCache = { at: Date.now(), dirs: await hostRootsAmong(candidates, options.dshHome) }
      } catch {
        // 注册表读不到（启动早期 / 宿主没有 skills 服务）就保留上一次结果，绝不报错。
      } finally {
        hostDirTask = undefined
      }
    })()
    return hostDirTask
  }

  /**
   * 本次读取要补的宿主目录。
   *
   * 有缓存就直接用 —— 进入技能页不该为了「宿主还在发布什么」去跑一遍全部 provider
   * （那是之前每进一次卡一下的原因）。缓存的更新交给 `refreshHostDirs`：启动、宿主
   * `skills/change`、显式 refresh。只有**从来没有缓存**时才等一次（有上限），否则面板
   * 永远看不到宿主来源；缓存过期只是后台补一次，绝不挡住这次读取。
   * provider 那条路径（`probeHost: false`）只读缓存。
   * 「是不是我们已有的来源」在这里按 `known` 过滤：缓存因此与调用方无关。
   */
  async function hostDirsOf(known: SkillRoot[], probeHost: boolean): Promise<string[]> {
    if (options.hostCandidates === undefined) return []
    if (probeHost) {
      if (hostDirCache === undefined) {
        await settleWithin(refreshHostDirs(), HOST_DIRS_PROBE_TIMEOUT)
      } else if (Date.now() - hostDirCache.at >= HOST_DIRS_TTL) {
        // 兜底：宿主事件没到（旧版本 / 事件丢失）时后台补一次，不占这次读取。
        void refreshHostDirs()
      }
    }
    const dirs = hostDirCache?.dirs ?? []
    // 宿主在发布我们已有的来源（$DSH_HOME/skills、~/.agents/skills 等）→ 不重复列。
    return dirs.filter((dir) => !known.some((root) => isInside(root.path, dir)))
  }

  async function view(cwd?: string, scopeKey?: string, read?: ReadOptions): Promise<SkillStateView> {
    const loaded = await readState()
    const roots = await rootsFor(cwd, read)
    return buildStateView({
      state: loaded.state,
      scanner,
      roots,
      warnings: loaded.warnings,
      scopeKey,
      stateHealthy: !loaded.degraded,
    })
  }

  /** 一个来源键 → 来源（找不到就是调用方给错了键）。 */
  async function rootFor(rootKey: string, cwd?: string): Promise<SkillRoot | undefined> {
    const roots = await rootsFor(cwd)
    return roots.find((candidate) => candidate.key === rootKey)
  }

  /** 定位一条技能（按目录名或声明名）。 */
  async function findRow(rootKey: string, name: string, cwd?: string): Promise<SkillRow | undefined> {
    const current = await view(cwd)
    return allRows(current).find((row) => row.rootKey === rootKey && (row.name === name || row.declaredName === name))
  }

  const service: SkillService = {
    providerName: PROVIDER_NAME,
    statePath,
    invalidators,
    touch,
    refreshHostDirs,
    view,
    roots: rootsFor,

    async detail(rootKey: string, name: string, cwd?: string): Promise<OpResult> {
      const row = await findRow(rootKey, name, cwd)
      if (row === undefined) return unavailable(name)
      const detail = await readSkillDetail(row)
      return { ok: true, data: { row, ...detail } }
    },

    async setSkill(rootKey: string, name: string, enabled: boolean, cwd?: string, scopeKey?: string): Promise<OpResult> {
      if (scopeKey !== undefined && scopeKey !== '') return reservedScope()
      const row = await findRow(rootKey, name, cwd)
      if (row === undefined) return unavailable(name)
      return mutate(async (state) => ({
        changed: applySkillSwitch(state, rootKey, row.name, enabled),
        value: { root: rootKey, name: row.name, enabled },
      }))
    },

    async setAll(items, enabled, cwd?, scopeKey?): Promise<OpResult> {
      if (scopeKey !== undefined && scopeKey !== '') return reservedScope()
      const current = await view(cwd)
      const wanted = new Map<string, SkillRow>()
      for (const row of allRows(current)) {
        if (items.some((item) => rowMatchesRef(row, item))) wanted.set(rowIdOf(row.rootKey, row.name), row)
      }
      if (wanted.size === 0) return { ok: true, data: { changed: false, updated: 0, missing: items.length } }
      return mutate(async (state) => {
        let updated = 0
        for (const row of wanted.values()) {
          if (applySkillSwitch(state, row.rootKey, row.name, enabled)) updated += 1
        }
        return { changed: updated > 0, value: { updated } }
      })
    },

    async restoreSkills(items): Promise<OpResult> {
      return mutate(async (state) => {
        let updated = 0
        for (const item of items) {
          if (applySkillSwitch(state, item.root, item.name, item.enabled)) updated += 1
        }
        return { changed: updated > 0, value: { updated } }
      })
    },

    async setSource(rootKey: string, enabled: boolean, scopeKey?: string, cwd?: string): Promise<OpResult> {
      if (scopeKey !== undefined && scopeKey !== '') return reservedScope()
      // `cwd` 是有意义的：项目来源只因对话所在项目而存在，不带它去解析来源，
      // 会把一个项目来源的键报成「不存在」。
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      if (root.project === true) {
        // 诚实拒绝，而不是静默空转：项目来源的存在与否跟着会话 cwd 走，不是一个开关。
        return {
          ok: false,
          error: `项目技能目录不能整体启停（它跟着对话所在项目出现）：${root.label}。请逐条启停其中的技能。`,
          code: 'error.source.project',
        }
      }
      return mutate(async (state) => {
        const current = state.sources[rootKey] !== false
        if (current === enabled) return { changed: false, value: { root: rootKey, enabled } }
        if (enabled) delete state.sources[rootKey]
        else state.sources[rootKey] = false
        return { changed: true, value: { root: rootKey, enabled } }
      })
    },

    async setRemoved(rootKey: string, removed: boolean, cwd?: string): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      if (root.project === true) {
        return { ok: false, error: `项目技能目录不能移除：${root.label}`, code: 'error.source.project' }
      }
      if (root.kind === 'local' || root.kind === 'import') {
        return { ok: false, error: `默认技能目录不能移除（只能停用）：${root.label}`, code: 'error.source.default' }
      }
      return mutate(async (state) => {
        const current = state.removedSources.includes(rootKey)
        if (current === removed) return { changed: false, value: { root: rootKey, removed } }
        state.removedSources = removed
          ? uniqueStrings([...state.removedSources, rootKey])
          : state.removedSources.filter((key) => key !== rootKey)
        return { changed: true, value: { root: rootKey, removed } }
      })
    },

    async prefer(rootKey: string, name: string, preferred: boolean): Promise<OpResult> {
      const row = await findRow(rootKey, name)
      if (row === undefined) return unavailable(name)
      return mutate(async (state) => {
        const current = state.preferredSkills[row.declaredName]
        if (preferred) {
          if (current === rootKey) return { changed: false, value: { name: row.declaredName, root: rootKey } }
          state.preferredSkills[row.declaredName] = rootKey
          return { changed: true, value: { name: row.declaredName, root: rootKey } }
        }
        if (current === undefined || current !== rootKey) return { changed: false, value: { name: row.declaredName } }
        delete state.preferredSkills[row.declaredName]
        return { changed: true, value: { name: row.declaredName } }
      })
    },

    async create(rootKey, input, cwd?): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      try {
        const created = await createSkill(root, {
          name: input.name,
          description: input.description,
          whenToUse: input.whenToUse,
          body: input.body ?? '',
        })
        touch(rootKey)
        log('skill-create', `新建 ${rootKey}/${created.name}`)
        return { ok: true, data: created }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async update(rootKey, name, changes, cwd?): Promise<OpResult> {
      const row = await findRow(rootKey, name, cwd)
      if (row === undefined) return unavailable(name)
      try {
        const result = await updateSkill(row, changes)
        touch(rootKey)
        log('skill-update', `编辑 ${rootKey}/${name}`)
        return { ok: true, data: result }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async remove(rootKey, name, cwd?): Promise<OpResult> {
      const row = await findRow(rootKey, name, cwd)
      if (row === undefined) return unavailable(name)
      try {
        const item = await lock(async () => {
          const deleted = await deleteSkillToTrash(options.dshHome, row)
          const loaded = await readState()
          if (forgetSkillEverywhere(loaded.state, rootKey, row.name)) {
            await saveState(statePath, loaded.state)
          }
          return deleted
        })
        touch(rootKey)
        log('skill-delete', `删除 ${rootKey}/${name} → 回收站 ${item.id}`)
        return { ok: true, data: item }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async trashList(): Promise<OpResult> {
      return { ok: true, data: { items: await listTrash(options.dshHome) } }
    },

    async trashRestore(id: string): Promise<OpResult> {
      try {
        const item = await restoreTrashItem(options.dshHome, id)
        touch(item.rootKey)
        log('skill-restore', `恢复 ${item.declaredName}`)
        return { ok: true, data: item }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async trashPurge(id: string): Promise<OpResult> {
      try {
        await purgeTrashItem(options.dshHome, id)
        return { ok: true, data: { id } }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async trashEmpty(): Promise<OpResult> {
      return { ok: true, data: { removed: await emptyTrash(options.dshHome) } }
    },

    async addRoot(path: string, label?: string): Promise<OpResult> {
      const expanded = path.trim()
      if (expanded === '') return { ok: false, error: '目录路径不能为空', code: 'error.root.pathRequired' }
      if (!isAbsolute(expanded)) return { ok: false, error: `必须是绝对路径：${expanded}`, code: 'error.root.notAbsolute' }
      const info = await stat(expanded).catch(() => null)
      if (info === null || !info.isDirectory()) {
        return { ok: false, error: `不是有效的目录：${expanded}`, code: 'error.root.notDirectory' }
      }
      const real = await realOrResolved(expanded)
      const key = await customRootKey(real)
      const roots = await rootsFor()
      // 再次添加一个已经是来源的目录 = 无事可做，而不是报「重叠」错误：
      // 用户要的就是它现在这个状态。
      if (roots.some((root) => root.key === key)) {
        return { ok: true, data: { key, changed: false, root: key } }
      }
      const overlap = await overlapsExisting(real, roots)
      if (overlap !== undefined) {
        return { ok: false, error: `这个目录与已有来源重叠：${overlap.label}（${overlap.path}）`, code: 'error.root.overlap' }
      }
      return mutate(async (state) => {
        if (customRootOf(state, key) !== undefined) return { changed: false, value: { key } }
        state.customRoots = [
          ...state.customRoots,
          {
            key,
            path: real,
            label: label !== undefined && label.trim() !== '' ? label.trim().slice(0, 64) : '自定义目录',
            rank: DEFAULT_RANKS.custom,
          },
        ]
        return { changed: true, value: { key } }
      })
    },

    async removeRoot(key: string): Promise<OpResult> {
      return mutate(async (state) => {
        if (customRootOf(state, key) === undefined) return { changed: false, value: { key } }
        state.customRoots = state.customRoots.filter((root) => root.key !== key)
        delete state.sources[key]
        delete state.hiddenSkills[key]
        delete state.ranks[key]
        state.removedSources = state.removedSources.filter((item) => item !== key)
        return { changed: true, value: { key } }
      })
    },


    async importZip(rootKey, base64, cwd?, only?): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      const guarded = bufferOf(base64)
      if (!Buffer.isBuffer(guarded)) return guarded
      try {
        const outcome = await importZip(root, guarded, only)
        touch(rootKey)
        log('skill-import-zip', `导入压缩包到 ${rootKey}：${namesOf(outcome.imported)}`)
        return { ok: true, data: outcome }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async scanImport(rootKey, base64, cwd?): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      const guarded = bufferOf(base64)
      if (!Buffer.isBuffer(guarded)) return guarded
      try {
        return { ok: true, data: await scanZip(root, guarded) }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async exportZip(selection, cwd?): Promise<OpResult> {
      const rows = allRows(await view(cwd))
      const wanted = selection === undefined || selection.length === 0
        ? rows.filter((row) => !row.shadowed)
        : rows.filter((row) => selection.some((item) => rowMatchesRef(row, item)))
      if (wanted.length === 0) return { ok: false, error: '没有可导出的技能', code: 'error.export.empty' }
      try {
        const single = wanted.length === 1
        const result = single
          ? { buffer: await exportRowAsZip(wanted[0]), files: 0 }
          : await exportRowsAsZip(wanted)
        const name = single ? `${wanted[0].declaredName}.zip` : `skills-${new Date().toISOString().slice(0, 10)}.zip`
        return { ok: true, data: { filename: name, base64: result.buffer.toString('base64'), skills: wanted.length } }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async refresh(): Promise<OpResult> {
      scanner.invalidate()
      // 显式刷新：连宿主发布的目录也重新探一次（写技能本身不影响宿主目录集合）。
      hostDirCache = undefined
      const current = await view()
      // 剪掉已不存在的策略名字 —— 但只在这里、只在显式 refresh 时做，绝不在普通读取里做
      // （那正是让被替换插件「每次面板轮询都写一次盘」的原因）。
      const pruned = await mutate(async (state) => {
        const result = pruneState(state, liveNameIndex(current))
        return { changed: result.changed, value: { dropped: result.dropped } }
      })
      return { ok: true, data: { generation: scanner.generation(), pruned: pruned.data, stats: scanner.stats() } }
    },

    makeProvider() {
      // 这条路径是宿主 `skills.list()` 回调进来的：再问注册表就是无限递归（面板会一直
      // 停在加载中），所以只读宿主目录的缓存，绝不探测。
      const read: ReadOptions = { probeHost: false }
      return createProvider({
        viewFor: (cwd, scopeKey) => view(cwd, scopeKey, read),
        rootsFor: (cwd) => rootsFor(cwd, read),
      })
    },

    stateInfo() {
      if (cached === undefined) return undefined
      return { origin: cached.origin, degraded: cached.degraded, warnings: cached.warnings }
    },
  }
  return service
}

/** base64 → Buffer，顺带守住空包与体积上限（scan 与 import 共用同一套判断）。 */
function bufferOf(base64: string): Buffer | OpResult {
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) return { ok: false, error: '压缩包是空的', code: 'error.upload.empty' }
  if (buffer.length > 32 * 1024 * 1024) return { ok: false, error: '压缩包过大（上限 32 MiB）', code: 'error.upload.tooLarge' }
  return buffer
}

/** 导入结果的技能名一览（日志用）。 */
function namesOf(imported: { name: string }[]): string {
  return imported.map((item) => item.name).join('、') || '无'
}

/**
 * 从宿主候选反推「技能来源目录」（只留最外层）。
 *
 * 每个候选只说明「这条技能在哪儿」，不说明「它属于哪个集合目录」，所以反推分两步：
 *   1. `hostRootOf` 只认能证明自己是**集合目录里的成员**的候选；
 *   2. `isPlausibleHostRoot` 拒绝系统容器（临时目录 / 家目录 / DSH 主目录等）——
 *      否则一条解包到 `%TEMP%\<skill>` 的内置技能就会把整个 Temp 变成来源。
 *
 * 「是不是我们已有的来源」不在这里判：缓存必须与某次读取的 `known` 无关，那一步在
 * `hostDirsOf` 里按当前来源过滤。
 */
async function hostRootsAmong(candidates: HostCandidate[], dshHome: string): Promise<string[]> {
  const dirs: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const dir = await hostRootOf(candidate)
    if (dir === undefined || !isPlausibleHostRoot(dir, dshHome)) continue
    const id = pathIdSync(dir)
    if (seen.has(id)) continue
    seen.add(id)
    dirs.push(dir)
  }
  return outermostOnly(dirs)
}

/**
 * 一条候选 → 它所在的集合目录。
 *
 * 文档路径（有的话）最准：
 *   * bundle：`<root>/<skill>/SKILL.md` → `<root>`（往上两级）；
 *   * 平铺：`<root>/<skill>.md`        → `<root>`（往上一级）。
 *
 * 但 `skills.list()` 的摘要只有 `resourceBase`（技能自己的目录）：bundle 是
 * `<root>/<skill>`，平铺技能就是 `<root>` 本身 —— 后者反推会多上一级（把 `~/.claude`
 * 这种目录当成来源），所以只有「目录里真的有 SKILL.md」的 bundle 才拿来反推。
 */
async function hostRootOf(candidate: HostCandidate): Promise<string | undefined> {
  if (typeof candidate?.docPath === 'string' && candidate.docPath !== '') {
    const doc = basename(candidate.docPath).toLowerCase()
    return doc === 'skill.md' ? dirname(dirname(candidate.docPath)) : dirname(candidate.docPath)
  }
  const skillDir = typeof candidate?.skillDir === 'string' ? candidate.skillDir : ''
  if (skillDir === '' || !(await isFile(join(skillDir, 'SKILL.md')))) return undefined
  return dirname(skillDir)
}

/**
 * 反推出来的目录能不能当来源。
 *
 * 这不是「猜目录」的补充，而是拒绝证据不足的猜测：临时目录 / 家目录 / DSH 主目录 /
 * 进程工作目录本身（以及它们的祖先）都可能是任意技能的落脚点，一旦成为来源就会把
 * 目录里的所有东西扫成技能。它们的**子目录**仍然可以是来源（`~/.claude/skills`、
 * `$DSH_HOME/tool-management/official-skills/<profile>` 都靠这条）。
 */
function isPlausibleHostRoot(dir: string, dshHome: string): boolean {
  const id = pathIdSync(dir)
  // 盘符 / 文件系统根。
  if (dirname(id) === id) return false
  for (const container of [tmpdir(), homedir(), dshHome, process.cwd()]) {
    const guard = pathIdSync(container)
    // 容器本身，或容器的祖先（例如 AppData\Local、C:\Users）。
    if (isInside(id, guard)) return false
  }
  return true
}

/** 只留最外层：某个目录已经在另一个目录之下，就并进祖先里。 */
function outermostOnly(dirs: string[]): string[] {
  return dirs.filter((dir) => !dirs.some((other) => other !== dir && isInside(other, dir)))
}

/** 等一个任务，但最多等 `ms` 毫秒（超时不算失败：任务继续在后台跑）。 */
function settleWithin(task: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    void task.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}