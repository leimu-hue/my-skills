/**
 * 规则相关的纯逻辑。
 *
 * 写规则是唯一会改用户环境的动作，所以这里容两点：
 *   1. 写入后**回读**并比较（`rules/add` 在部分 whistle 版本上不是覆盖语义）；
 *   2. 变更结果只报「改了什么 + 当前开关」，不把整份规则表再灌一遍。
 */
import type { WhistleRulesStatus } from './types.ts'

export interface RulesSummary {
  /** 全局关闭所有（非插件）规则。 */
  disabled: boolean
  /** 全局关闭所有插件规则。 */
  pluginsDisabled: boolean
  multiSelect: boolean
  laterRulesFirst: boolean
  /** 处于选中状态的规则文件名。 */
  selected: string[]
  /** `rules/status` 认识的全部文件名（含 `rules/list` 不返回的内置 Default）。 */
  files: Array<{ name: string; selected: boolean }>
  total: number
}

export function summariseRules(status: WhistleRulesStatus | undefined): RulesSummary {
  const list = Array.isArray(status?.list) ? status.list : []
  const files = list.map((item) => ({ name: item?.name ?? '', selected: item?.selected === true }))
  return {
    disabled: status?.disabled === true,
    pluginsDisabled: status?.pluginsDisabled === true,
    multiSelect: status?.multiSelect === true,
    laterRulesFirst: status?.laterRulesFirst === true,
    selected: files.filter((item) => item.selected).map((item) => item.name),
    files,
    total: files.length,
  }
}

/** 比较规则文本时忽略换行风格与结尾空行：whistle 可能把 `\n` 规范化成 `\r\n`。 */
export function normaliseRuleText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

export function sameRuleText(left: string, right: string): boolean {
  return normaliseRuleText(left) === normaliseRuleText(right)
}

/** `rules.get()` 在不同版本上可能给字符串、`{ value }` 或空。 */
export function ruleValueOf(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw !== null && typeof raw === 'object') {
    const value = (raw as { value?: unknown }).value
    if (typeof value === 'string') return value
  }
  return ''
}

/**
 * 规则文件是否存在。
 *
 * 真实环境里 `rules/get` 对存在但为空的文件返回 `{ selected: true }`（没有
 * `value` 字段），只有真不存在时才返回空 —— 所以「不是空值」才算存在，
 * 不能用内容是否为空来判断。
 */
export function ruleExists(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false
  if (typeof raw === 'string') return raw !== ''
  return true
}
