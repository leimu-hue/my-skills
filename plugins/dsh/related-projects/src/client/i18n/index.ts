/**
 * 本插件的词典与命名空间声明。
 *
 * `zh` 是键集的事实来源：`EN` 的类型就是 `Record<keyof typeof ZH, string>`，
 * 少一个键、多一个键都是编译错误——两份词典不会悄悄分叉。
 *
 * `LocaleNamespaceMap` 的声明合并让框架的 `t` 席位（注册项上的 `locale: NS`）
 * 带上本命名空间的键类型，同时让 `ctx.locale.register(NS, { zh, en })` 命中
 * 带类型的两参数重载。
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { ZH_COMMON, EN_COMMON } from './common.js'
import { ZH_DOCK, EN_DOCK } from './dock.js'
import { ZH_MENU, EN_MENU } from './menu.js'
import { ZH_PANEL, EN_PANEL } from './panel.js'

export const NS = 'related-projects'

export const ZH = { ...ZH_COMMON, ...ZH_PANEL, ...ZH_DOCK, ...ZH_MENU }
export const EN: Record<keyof typeof ZH, string> = { ...EN_COMMON, ...EN_PANEL, ...EN_DOCK, ...EN_MENU }

/** 本命名空间的字典键并集。 */
export type TranslateKey = keyof typeof ZH

/** 框架注入的译员席位（`locale: NS` 那一份）。 */
export type Translate = TranslateNS<typeof NS>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 关联项目面板、输入框下方条、`@` 菜单分组的文案。 */
    'related-projects': TranslateKey
  }
}
