/**
 * 技能域的纯选择器：新建 / 导入落点、搜索过滤。
 *
 * 这里没有请求、没有状态 —— 视图只关心「显示哪几行」「写到哪个目录」，答案都由这几个
 * 纯函数给。排序与可见性来自 host 的视图（`skills` 已按「赢家在前、声明名、rank」排好）。
 */
import type { RootView, SkillRow, SkillStateView } from '../core/types.ts'

/** 一次导入的体积上限，与 host 的 `import-zip` 对齐。 */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024

/** 只有可写且没被移除的来源能接收新建 / 导入。 */
export function writableRoots(view: SkillStateView | null): RootView[] {
  return (view?.roots ?? []).filter((root) => root.writable && !root.removed)
}

/**
 * 新建落点：固定在「DSH 技能」（用户的技能目录，宿主的 filesystem provider 也扫它）。
 * 早先给一个「导入技能 / DSH 技能」的下拉，但两个键名对用户没有意义 —— 新建就是放进自己的
 * 技能目录，导入才进插件的独立落点。
 */
export function createTargetOf(view: SkillStateView | null): RootView | undefined {
  const candidates = writableRoots(view)
  return candidates.find((root) => root.key === 'local') ?? candidates[0]
}

/** 导入落点：固定在「导入技能」（这个插件自己的目录，rank 高于本地同名技能）。 */
export function importTargetOf(view: SkillStateView | null): RootView | undefined {
  return (view?.roots ?? []).find((root) => root.key === 'import') ?? writableRoots(view)[0]
}

/** 搜索命中：声明名、内部名与描述都参与，空查询即不过滤。 */
export function visibleRowsOf(root: RootView, query: string): SkillRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return root.skills
  return root.skills.filter((row) =>
    row.declaredName.toLowerCase().includes(needle)
    || row.name.toLowerCase().includes(needle)
    || row.description.toLowerCase().includes(needle))
}
