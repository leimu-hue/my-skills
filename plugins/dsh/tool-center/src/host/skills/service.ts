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
import { isAbsolute } from 'node:path'
import type { SkillManagerState, SkillRoot, SkillRow, SkillStateView, StateLoad } from '../shared/types.js'
import { DomainError, errorResult, type OpResult } from '../shared/result.js'
import { createLock, realOrResolved } from '../shared/paths.js'
import type { Scanner } from './scan.js'
import { createScanner } from './scan.js'
import { DEFAULT_RANKS, dedupeRoots, overlapsExisting, projectRootsFor, staticRoots } from './roots.js'
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
import { exportRowAsZip, exportRowsAsZip, importFromPath, importZip } from './files/transfer.js'
import { PROVIDER_NAME, createProvider } from './provider.js'

export type { OpResult } from '../shared/result.js'

export interface ServiceOptions {
  dshHome: string
  agentsHome: string
  claudeHome?: string
  codexHome?: string
  builtinDir?: string
  /** 写插件日志用的一行（人类可读）。 */
  log?: (event: string, detail: string) => void
  scanner?: Scanner
}

export interface SkillService {
  readonly providerName: string
  readonly statePath: string
  view(cwd?: string, scopeKey?: string): Promise<SkillStateView>
  roots(cwd?: string): Promise<SkillRoot[]>
  detail(rootKey: string, name: string, cwd?: string): Promise<OpResult>
  setSkill(rootKey: string, name: string, enabled: boolean, cwd?: string, scopeKey?: string): Promise<OpResult>
  setAll(items: { root: string; name: string }[], enabled: boolean, cwd?: string, scopeKey?: string): Promise<OpResult>
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
  importPath(rootKey: string, path: string, cwd?: string): Promise<OpResult>
  importZip(rootKey: string, base64: string, cwd?: string): Promise<OpResult>
  exportZip(selection: { root: string; name: string }[] | undefined, cwd?: string): Promise<OpResult>
  refresh(): Promise<OpResult>
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

  async function rootsFor(cwd?: string): Promise<SkillRoot[]> {
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
    return roots
  }

  async function view(cwd?: string, scopeKey?: string): Promise<SkillStateView> {
    const loaded = await readState()
    const roots = await rootsFor(cwd)
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

    async importPath(rootKey, path, cwd?): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      try {
        const outcome = await importFromPath(root, path)
        touch(rootKey)
        log('skill-import', `导入 ${rootKey}：${namesOf(outcome.imported)}`)
        return { ok: true, data: outcome }
      } catch (cause) {
        return errorResult(cause)
      }
    },

    async importZip(rootKey, base64, cwd?): Promise<OpResult> {
      const root = await rootFor(rootKey, cwd)
      if (root === undefined) return unknownRoot(rootKey)
      const buffer = Buffer.from(base64, 'base64')
      if (buffer.length === 0) return { ok: false, error: '压缩包是空的', code: 'error.upload.empty' }
      if (buffer.length > 32 * 1024 * 1024) return { ok: false, error: '压缩包过大（上限 32 MiB）', code: 'error.upload.tooLarge' }
      try {
        const outcome = await importZip(root, buffer)
        touch(rootKey)
        log('skill-import-zip', `导入压缩包到 ${rootKey}：${namesOf(outcome.imported)}`)
        return { ok: true, data: outcome }
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
      return createProvider({
        viewFor: (cwd, scopeKey) => view(cwd, scopeKey),
        rootsFor: (cwd) => rootsFor(cwd),
      })
    },

    stateInfo() {
      if (cached === undefined) return undefined
      return { origin: cached.origin, degraded: cached.degraded, warnings: cached.warnings }
    },
  }
  return service
}

/** 导入结果的技能名一览（日志用）。 */
function namesOf(imported: { name: string }[]): string {
  return imported.map((item) => item.name).join('、') || '无'
}
