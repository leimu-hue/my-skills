/**
 * 词典。`zh` 是键集的事实来源；`en` 必须覆盖每个键（缺键会回退成键名，而键名会显示在
 * 面板上，所以漏了看得见）。
 *
 * 词条按域分文件：改哪一域只看哪一段。合并只做一次浅展开，没有「覆盖层」——早先是
 * `locale.ts` + `locale-domains.ts` + 三段 `Object.assign` 叠加，同一个键被定义两三遍，
 * 想知道最终文案得从头读到尾。
 */
import { EN_COMMON, ZH_COMMON } from './common.js'
import { EN_SKILLS, ZH_SKILLS } from './skills.js'
import { EN_PROMPTS, ZH_PROMPTS } from './prompts.js'
import { EN_MCP, ZH_MCP } from './mcp.js'
import { EN_SCENES, ZH_SCENES } from './scenes.js'

export const NS = 'tool-center'

export type Translate = (key: string, values?: Record<string, unknown>) => string

const ZH: Record<string, string> = {
  ...ZH_COMMON,
  ...ZH_SKILLS,
  ...ZH_PROMPTS,
  ...ZH_MCP,
  ...ZH_SCENES,
}

const EN: Record<string, string> = {
  ...EN_COMMON,
  ...EN_SKILLS,
  ...EN_PROMPTS,
  ...EN_MCP,
  ...EN_SCENES,
}

export function translateWith(dict: Record<string, string>, key: string, values?: Record<string, unknown>): string {
  const template = dict[key]
  if (template === undefined) return key
  if (values === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_all, name: string) => {
    const value = values[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}

/** 按宿主 locale 快照挑词典，但不依赖这个服务一定存在。 */
export function dictionaryFor(active: string | undefined): Record<string, string> {
  return String(active ?? '').toLowerCase().startsWith('zh') ? ZH : EN
}

/** 交给 `locale.register(ns, dicts)` 的载荷。 */
export function dictionaries(): { zh: Record<string, string>; en: Record<string, string> } {
  return { zh: ZH, en: EN }
}

/**
 * 最近一次确定的词典（模块级）。
 *
 * 给拿不到 `props.t` 的组件用 —— 例如注入到宿主其它槽位的小控件（新会话页的场景选择器）：
 * 它们由宿主渲染，不经过本插件的页签外壳。
 */
let activeDict: Record<string, string> = EN

export function setActiveDictionary(dict: Record<string, string>): void {
  activeDict = dict
}

/** 用模块级词典取一句文案（槽位里的小控件用）。 */
export function tNow(key: string, values?: Record<string, unknown>): string {
  return translateWith(activeDict, key, values)
}
