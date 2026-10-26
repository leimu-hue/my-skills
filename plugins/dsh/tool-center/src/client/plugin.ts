/**
 * Slot 接线。这里不渲染任何东西：每次注册都指向一个自己通过 API 模块取数据的组件。
 *
 * 只有 `slots` 是硬依赖（没有它就没有地方挂）。`locale` 通过 `ctx.inject` 附加，
 * 所以缺了 locale 服务的代价只是少一份词典，而不是整个面板挂不上。
 */
import { CSS } from './styles.js'
import { setReact, h, type ReactLike } from './core/runtime.js'
import { NS, dictionaries, dictionaryFor, translateWith } from './i18n/index.js'
import { ToolCenterPage, setDictionary } from './page.js'

export const PAGE_ID = 'tool-center'
const PAGE_ORDER = 17

interface SlotsLike {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void
}

interface LocaleLike {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  getSnapshot?(): { active?: string }
}

export interface PluginContext {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): () => void
  inject?(names: string[], callback: (scoped: PluginContext) => void): unknown
}

export interface Plugin {
  inject: string[]
  apply(ctx: PluginContext): void
}

/** 宿主的当前语言；服务不在或抛错都当成「不知道」。 */
function activeLocaleOf(ctx: PluginContext): string | undefined {
  try {
    const locale = ctx.get('locale') as LocaleLike | undefined
    return locale?.getSnapshot?.().active
  } catch {
    return undefined
  }
}

export function createPlugin(React: unknown): Plugin {
  setReact(React as ReactLike)

  return {
    inject: ['slots'],
    apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-tool-center', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() }, 'tool-center: styles')

      /* 词典：服务在就注册，同时留一份模块级副本给组件的兜底取词用。 */
      const mountDictionary = (scoped: PluginContext): void => {
        setDictionary(dictionaryFor(activeLocaleOf(scoped)))
        const locale = scoped.get('locale') as LocaleLike | undefined
        if (locale === undefined || locale === null || typeof locale.register !== 'function') {
          console.warn('[tool-center] locale service unavailable; UI copy falls back to the bundled dictionaries')
          return
        }
        scoped.effect(() => {
          try {
            return locale.register(NS, dictionaries())
          } catch (error) {
            console.warn('[tool-center] locale dictionaries already registered (stale reload)', error)
            return () => undefined
          }
        }, 'tool-center: dictionaries')
      }
      if (typeof ctx.inject === 'function') ctx.inject(['locale'], mountDictionary)
      else mountDictionary(ctx)

      const slots = ctx.get('slots') as SlotsLike | undefined
      if (slots === undefined || slots === null) {
        console.warn('[tool-center] slots service unavailable; the settings page cannot mount')
        return
      }

      ctx.effect(() => slots.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: PAGE_ID,
        order: PAGE_ORDER,
        // 标签 thunk 每次投影都会重新求值，所以能跟着语言切换。
        label: (): string => translateWith(dictionaryFor(activeLocaleOf(ctx)), 'nav.title'),
        locale: NS,
      }, (props: Record<string, unknown>) => h(ToolCenterPage as never, props))), 'tool-center: settings page')
    },
  }
}
