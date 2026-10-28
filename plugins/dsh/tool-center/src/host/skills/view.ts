/**
 * 组装一份一致的视图：「有哪些技能、哪些开着」。
 *
 * 所有消费者（面板、provider、工具）都从这里读，所以「一次读取只扫一遍」而不是
 * 「每条路径各扫一遍」：被替换的插件有四条互相独立的扫描路径（`state`、`list`、`get`、
 * `detail`），它们之间会互相矛盾。
 */
import type { RootView, SkillManagerState, SkillRoot, SkillRow, SkillStateView } from '../shared/types.ts'
import type { Scanner } from './scan.ts'
import { compareRows, groupRows, rowOf } from './policy.ts'

export interface ViewInput {
  state: SkillManagerState
  scanner: Scanner
  /** 静态来源，加上由调用方 cwd 推导出来的项目来源。 */
  roots: SkillRoot[]
  warnings?: string[]
  scopeKey?: string
  stateHealthy?: boolean
}

export async function buildStateView(input: ViewInput): Promise<SkillStateView> {
  const started = Date.now()
  const removed = new Set(input.state.removedSources)
  const warnings = [...(input.warnings ?? [])]

  const scans = await Promise.all(
    input.roots.map(async (root) => {
      if (removed.has(root.key)) return { root, rows: [] as SkillRow[], error: undefined, truncated: false }
      const scan = await input.scanner.scan(root)
      const rows = scan.entries.map((entry) => rowOf({ root, entry }, input.state, input.scopeKey))
      return { root, rows, error: scan.error, truncated: scan.truncated === true }
    }),
  )

  // 同名归属必须跨来源一次裁决完，之后才谈每行是否可见。
  const allRows = scans.flatMap((scan) => scan.rows)
  groupRows(allRows)

  let enabled = 0
  let disabled = 0
  let shadowed = 0
  const rootViews: RootView[] = []
  for (const scan of scans) {
    const rows = scan.rows.sort(compareRows)
    for (const row of rows) {
      if (row.shadowed) shadowed += 1
      else if (row.policy.modelInvocable) enabled += 1
      else disabled += 1
    }
    rootViews.push({
      key: scan.root.key,
      path: scan.root.path,
      label: scan.root.label,
      rank: scan.root.rank,
      kind: scan.root.kind,
      writable: scan.root.writable,
      toggleable: scan.root.toggleable,
      project: scan.root.project === true,
      hostScans: scan.root.hostScans,
      enabled: !removed.has(scan.root.key)
        && (scan.root.project === true || input.state.sources[scan.root.key] !== false),
      removed: removed.has(scan.root.key),
      skills: rows,
      error: scan.error,
      truncated: scan.truncated === true ? true : undefined,
    })
    if (scan.error !== undefined) warnings.push(`${scan.root.label}：${scan.error}`)
    if (scan.truncated) warnings.push(`${scan.root.label}：目录过多，只列出了前一部分`)
  }

  rootViews.sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label))

  return {
    roots: rootViews,
    counts: {
      total: allRows.length,
      enabled,
      disabled,
      shadowed,
      sources: rootViews.filter((root) => !root.removed).length,
    },
    warnings,
    scopeKey: input.scopeKey ?? '',
    generation: input.scanner.generation(),
    durationMs: Date.now() - started,
    stateHealthy: input.stateHealthy !== false,
  }
}

/**
 * 当前扫描的「来源键 → 现存的名字（目录名与声明名）」，用于剪掉已不存在技能的策略条目
 * （审计 B5：被替换的插件从不清理，于是删除再重建同名技能会继承旧开关）。
 */
export function liveNameIndex(view: SkillStateView): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const root of view.roots) {
    if (root.removed) continue
    const names = new Set<string>()
    for (const row of root.skills) {
      names.add(row.name)
      names.add(row.declaredName)
    }
    index.set(root.key, names)
  }
  return index
}

/** 打平的行列表，给 provider 与工具用。 */
export function allRows(view: SkillStateView): SkillRow[] {
  const rows: SkillRow[] = []
  for (const root of view.roots) rows.push(...root.skills)
  return rows
}
