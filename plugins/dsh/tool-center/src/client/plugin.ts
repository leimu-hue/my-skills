/**
 * Slot 接线。这里不渲染任何东西：每次注册都指向一个自己通过 API 模块取数据的组件。
 *
 * 挂载点是**左侧栏**，不是设置页：一个侧栏图标 + 一个主栏面板，两个栏位用同一个 id
 * （`tool-center`）配对 —— 点图标就在主栏打开面板。
 *
 * 只有 `slots` 是硬依赖（没有它就没有地方挂）。`locale` 通过 `ctx.inject` 附加，
 * 所以缺了 locale 服务的代价只是少一份词典，而不是整个面板挂不上。
 */
import { CSS } from './styles.js'
import { callOp, isPluginGone, onPluginGone, onPluginRevived } from './core/api.js'
import { setReact, h, type ReactLike } from './core/runtime.js'
import { NS, dictionaries, dictionaryFor, setActiveDictionary, translateWith } from './i18n/index.js'
import { ToolCenterPanel } from './shell/panel.js'
import { ToolCenterIcon } from './shell/icon.js'
import { SceneHeroOption } from './scenes/hero.js'
import { setDictionary } from './page.js'

const PANEL_ID = 'tool-center'
/** 排在「关联项目」（order 30）之后。 */
const PANEL_ORDER = 31
/** 新会话行里的场景选择器（order 靠后，别把工作区 / 预设控件挤开）。 */
const HERO_OPTION_ID = 'tool-center-scene'
const HERO_OPTION_ORDER = 60

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
      /**
       * 一份生命周期。
       *
       * 样式、词典、三个槽位都登记在同一个列表里：停用时整体拆、重新启用时整体装。
       * 早先样式归 `ctx.effect` 管、词典归 `scoped.effect` 管、槽位归 `mounted` 管 ——
       * 三份归属各自成立，但「插件被停用时到底谁回收了什么」只能靠读三处代码拼出来，
       * 于是第一版漏了「装回来」，第二版又把词典落在了外面。
       */
      const registrations: (() => void)[] = []
      const once = (fn: () => void): (() => void) => {
        let done = false
        return () => {
          if (done) return
          done = true
          try {
            fn()
          } catch {
            /* 已经没了 */
          }
        }
      }
      const track = (dispose: unknown): void => {
        if (typeof dispose === 'function') registrations.push(once(dispose as () => void))
      }
      const disposeAll = (): void => {
        for (const dispose of registrations.splice(0)) dispose()
      }

      const style = document.createElement('style')
      style.setAttribute('data-dsh-tool-center', '')
      style.textContent = CSS

      /** 词典要等 locale 就绪才能注册；`ctx.inject` 的回调可能早于也可能晚于首次挂载。 */
      let localeScoped: PluginContext | null = null
      let dictionaryOn = false

      const mountDictionary = (scoped: PluginContext): void => {
        localeScoped = scoped
        const dict = dictionaryFor(activeLocaleOf(scoped))
        setDictionary(dict)
        setActiveDictionary(dict)
        if (dictionaryOn) return
        const locale = scoped.get('locale') as LocaleLike | undefined
        if (locale === undefined || locale === null || typeof locale.register !== 'function') {
          console.warn('[tool-center] locale service unavailable; UI copy falls back to the bundled dictionaries')
          return
        }
        try {
          const dispose = locale.register(NS, dictionaries())
          dictionaryOn = true
          track(() => {
            dictionaryOn = false
            dispose?.()
          })
        } catch (error) {
          // 上一次 bundle 已经注册过同名 namespace（stale reload）：用模块级副本兜底。
          console.warn('[tool-center] locale dictionaries already registered (stale reload)', error)
        }
      }

      // 宿主卸载时兜底回收一次；我们自己的 teardown 服务的是「插件被停用」那条路径。
      ctx.effect(() => () => { disposeAll() }, 'tool-center: registrations')

      if (typeof ctx.inject === 'function') ctx.inject(['locale'], mountDictionary)
      else mountDictionary(ctx)

      const slots = ctx.get('slots') as SlotsLike | undefined
      if (slots === undefined || slots === null) {
        console.warn('[tool-center] slots service unavailable; the panel cannot mount')
        return
      }

      let slotsMounted = false

      const mount = (name: string, options: Record<string, unknown>, component: unknown): void => {
        track(slots.inject(name, () => slots.register(
          { name, ...options },
          (props: Record<string, unknown>) => h(component as never, props),
        )))
      }

      /**
       * 挂载全部可见面。
       *
       * 两件事都要成立，缺一个就会留下「再也回不来」或「停用了还赖着」：
       *   * 停用插件时把已注入的槽位收回去（否则页签还在、点开就 405）；
       *   * 重新启用后把它们**重新挂回来**（早先只做了前者，于是先关再开就再也看不到图标）。
       */
      const mountAll = (): void => {
        if (slotsMounted) return
        slotsMounted = true
        try {
          if (typeof document !== 'undefined' && !document.head.contains(style)) document.head.appendChild(style)
        } catch {
          /* 样式挂不回去也不影响功能 */
        }
        track(() => style.remove())
        if (localeScoped !== null) mountDictionary(localeScoped)

        /* 侧栏图标：标签 thunk 每次投影都重新求值，所以能跟着语言切换。 */
        mount('sidebar.panellist', {
          id: PANEL_ID,
          order: PANEL_ORDER,
          locale: NS,
          label: () => translateWith(dictionaryFor(activeLocaleOf(ctx)), 'nav.title'),
        }, ToolCenterIcon)

        /* 主栏面板：和上面的图标用同一个 id 配对。 */
        mount('main', {
          key: PANEL_ID,
          locale: NS,
        }, ToolCenterPanel)

        /* 新会话页的场景选择器：会话开始时决定这次对话用哪个场景。 */
        mount('conversation.hero.options', {
          id: HERO_OPTION_ID,
          order: HERO_OPTION_ORDER,
          locale: NS,
        }, SceneHeroOption)
      }

      const teardown = (): void => {
        slotsMounted = false
        disposeAll()
      }

      mountAll()

      // 先让这一轮渲染落地再拆 / 再挂：在组件渲染过程中动自己的槽位会让 React 报错。
      ctx.effect(() => onPluginGone(() => setTimeout(teardown, 0)), 'tool-center: unload guard')
      ctx.effect(() => onPluginRevived(() => setTimeout(mountAll, 0)), 'tool-center: revive guard')

      /**
       * 探活。
       *
       * 停用插件不会把已注入的槽位收回去，于是「图标还挂在那儿、点开就 405」是必然的落差；
       * 反过来，重新启用之后也要能自己回来。两个方向共用同一个极轻的 `health` 探测：
       *   * 切回窗口（visibilitychange）时探一次 —— 不加定时器、不产生后台流量；
       *   * 处于「已停用」状态时，每 5 秒重试一次（最多 5 分钟），拿到真实回执即自动重挂。
       */
      ctx.effect(() => {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
          return () => undefined
        }
        let checking = false
        let retry: ReturnType<typeof setInterval> | null = null
        let attempts = 0
        const probe = (): void => {
          if (checking) return
          checking = true
          void callOp('health', {}).catch(() => undefined).finally(() => { checking = false })
        }
        const onVisibility = (): void => {
          if (document.visibilityState !== undefined && document.visibilityState !== 'visible') return
          probe()
        }
        const startRetry = (): void => {
          if (retry !== null) return
          attempts = 0
          retry = setInterval(() => {
            attempts += 1
            if (!isPluginGone() || attempts > 60) {
              if (retry !== null) clearInterval(retry)
              retry = null
              return
            }
            probe()
          }, 5000)
        }
        const stopRetry = (): void => {
          if (retry === null) return
          clearInterval(retry)
          retry = null
        }

        document.addEventListener('visibilitychange', onVisibility)
        const offGone = onPluginGone(startRetry)
        const offRevived = onPluginRevived(stopRetry)
        if (isPluginGone()) startRetry()

        return () => {
          stopRetry()
          offGone()
          offRevived()
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, 'tool-center: liveness')
    },
  }
}
