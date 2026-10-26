/**
 * 词典，以及跟随宿主 locale 的装配逻辑。
 *
 * `zh` 是键集的事实来源；`en` 必须覆盖每一个键（缺键会回退成
 * 键名本身，而键名会显示在界面上，所以漏了看得见）。
 * `common` 放多个功能共用的文案，每个功能各管自己的
 * 前缀，所以给面板加文案只改 `panel.ts`。
 */
import { ZH_COMMON, EN_COMMON } from './common.js'
import { ZH_DOCK, EN_DOCK } from './dock.js'
import { ZH_MENU, EN_MENU } from './menu.js'
import { ZH_PANEL, EN_PANEL } from './panel.js'

export const NS = 'related-projects'

export type Translate = (key: string, values?: Record<string, unknown>) => string

export const ZH: Record<string, string> = { ...ZH_COMMON, ...ZH_PANEL, ...ZH_DOCK, ...ZH_MENU }
export const EN: Record<string, string> = { ...EN_COMMON, ...EN_PANEL, ...EN_DOCK, ...EN_MENU }

type Ctx = { get(name: string): unknown }

export interface LocaleService {
  getSnapshot?(): { active?: string }
}

export function fill(template: string, values?: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    values !== undefined && values[key] !== undefined ? String(values[key]) : match
  ))
}

function activeTag(ctx: Ctx): string {
  try {
    const locale = ctx.get('locale') as LocaleService | undefined
    const active = locale?.getSnapshot?.()?.active
    if (typeof active === 'string' && active !== '') return active
  } catch {
    /* 回退到浏览器 */
  }
  if (typeof navigator === 'object' && typeof navigator.language === 'string') return navigator.language
  return ''
}

export function dictionaryFor(tag: string): Record<string, string> {
  const primary = tag.toLowerCase().replace(/_/g, '-').split('-')[0]
  return primary === 'zh' ? ZH : EN
}

export function translate(ctx: Ctx, key: string, values?: Record<string, unknown>): string {
  const dict = dictionaryFor(activeTag(ctx))
  return fill(dict[key] ?? EN[key] ?? key, values)
}

/**
 * 保留框架的 `t` 席位，但绝不让原始键名直接进到 DOM。
 *
 * locale 运行时里没有这个命名空间的词典时，席位会把键名本身返回——可能是
 * 注册从未落地（在这个 fiber 里取不到该服务），也可能是重新加载时丢掉了。
 * 屏幕上出现 `dock.label` 就是坏掉的 UI，这比文案语言不对更糟，所以取不到
 * 时要回退到这个插件自己的词典：它读同一份 locale 快照，只有那里也没有
 * 时才落到 `navigator`。席位仍是首选，只要词典注册着，就以框架为准，
 * 包括之后才注册的语言包——
 * 这一层回退只是在席位缺席时兜底。
 */
export function withFallback(seat: Translate | undefined, fallback: Translate): Translate {
  return (key, values) => {
    const resolved = typeof seat === 'function' ? seat(key, values) : undefined
    if (typeof resolved === 'string' && resolved !== '' && resolved !== key) return resolved
    return fallback(key, values)
  }
}
