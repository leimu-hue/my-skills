/**
 * 工具中心的页签外壳：场景 / MCP / 技能 / 提示词。
 *
 * 外壳只做三件事：记住当前页签、提供一条统一的 toast、把 `t` 与 `notify` 交给各域视图。
 * 每个域自己读自己的数据、自己写自己的 op —— 一个域挂了不影响别的域。
 */
import { h, useClientEffect, useStateOf } from './core/runtime.js'
import { translateWith, type Translate } from './i18n/index.js'
import { SkillsView } from './skills/view.js'
import { PromptsView } from './prompts/view.js'
import { McpView } from './mcp/view.js'
import { ScenesView } from './scenes/view.js'

/** 模块级兜底词典：locale 服务不在时，组件仍然能取词。 */
let activeDictionary: Record<string, string> = {}

/** 由插件外壳调用，让组件不必靠 props 也能取词。 */
export function setDictionary(dict: Record<string, string>): void {
  activeDictionary = dict
}

const TABS = ['scenes', 'mcp', 'skills', 'prompts'] as const
type TabKey = typeof TABS[number]
const TAB_KEY = 'tool-center:tab'

export function ToolCenterPage(props: Record<string, unknown>): unknown {
  const fromProps = props?.t
  const t: Translate = typeof fromProps === 'function'
    ? (fromProps as Translate)
    : (key, values) => translateWith(activeDictionary, key, values)
  const [tab, setTab] = useStateOf<TabKey>('skills')
  const [toast, setToast] = useStateOf('')

  const notify = (message: string): void => {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? '' : current)), 2800)
  }

  useClientEffect(() => {
    // 记住上次看的页签，切回设置面板时不用重新找。
    try {
      const saved = window.localStorage.getItem(TAB_KEY)
      if (saved !== null && (TABS as readonly string[]).includes(saved)) setTab(saved as TabKey)
    } catch {
      /* localStorage 不可用时用默认页签 */
    }
  }, [])

  const select = (next: TabKey): void => {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_KEY, next)
    } catch {
      /* 记不住也不影响使用 */
    }
  }

  const view = (): unknown => {
    switch (tab) {
      case 'scenes':
        return h(ScenesView as never, { t, notify })
      case 'mcp':
        return h(McpView as never, { t, notify })
      case 'prompts':
        return h(PromptsView as never, { t, notify })
      default:
        return h(SkillsView as never, { t, notify })
    }
  }

  return h('div', { className: 'dsk-root' },
    h('div', { className: 'dsk-tabs', role: 'tablist' },
      TABS.map((key) => h('button', {
        key,
        role: 'tab',
        className: 'dsk-tab',
        'data-active': String(tab === key),
        'aria-selected': String(tab === key),
        onClick: () => select(key),
      }, t('tab.' + key)))),
    h('div', { key: tab }, view()),
    toast !== '' ? h('div', { className: 'dsk-toast' }, toast) : null,
  )
}
