/**
 * slot 装配。这里不渲染任何东西——每个注册都指向一个通过 store 自己管数据的
 * 组件。
 *
 * 刻意用了两种延迟绑定：
 *   - `inject` 用于组合可能在本 apply 跑完之后才提供的服务
 *     （locale 字典、`@` 流水线）；
 *   - `slots` 不用延迟绑定，它是硬依赖：没有它就没有东西可挂载，
 *     所以缺 `slots` 时 apply 直接结束。
 */
import { CSS } from './styles.js'
import { setReact, h } from './core/runtime.js'
import { NS, EN, ZH, translate, type Translate } from './i18n/index.js'
import { workspaceHintOf } from './core/session.js'
import { dockStoreFor } from './dock/store.js'
import { DockRow } from './dock/view.js'
import { Panel } from './panel/view.js'
import { PanelIcon } from './panel/icon.js'
import { createTriggerSource } from './menu/source.js'
import type { TriggerSource } from './menu/types.js'

export const PANEL_ID = 'related-projects'
const DOCK_ORDER = 60
const ICON_ORDER = 30

interface SlotsLike {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void
}

interface InputTriggersLike {
  registerSource(source: TriggerSource): () => void
}

interface LocaleLike {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
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

export function createPlugin(React: unknown): Plugin {
  setReact(React as never)

  return {
    /* 只有 `slots` 是硬依赖：没有它就没有可挂载的东西。`locale` 和
       `inputTriggers` 走下面的 `ctx.inject` 挂接，因此晚到的服务照样能完成注册，
       而缺失时只降级对应功能（`fallbackT` 这一项保证文案仍可读）。 */
    inject: ['slots'],
    apply(ctx) {
      installStyles(ctx)

      whenProvided(ctx, ['locale'], (scoped) => {
        /* 每个 `locale: NS` 注册里 `t` 那一项背后的字典。重复的旧实例——热重载
           时前任的 effect 还活着——会抛 "namespace already has locale"，而字典
           其实已经就位，所以不能让这件事中断本次 apply 的其余部分。 */
        const locale = scoped.get('locale') as LocaleLike | undefined
        if (locale === undefined || locale === null || typeof locale.register !== 'function') {
          warn('locale service unavailable; UI copy falls back to the bundled dictionaries')
          return
        }
        scoped.effect(() => guarded(
          () => locale.register(NS, { zh: ZH, en: EN }),
          'locale dictionaries already registered (stale reload)',
        ), 'related-projects: dictionaries')
      })

      whenProvided(ctx, ['inputTriggers'], (scoped) => {
        /* `@` 源：喂给官方触发菜单，UI 全归它管。同一个 (trigger, name) 已注册
           时 `registerSource` 会抛错——同样是热重载重复——所以不能让这件事中断
           本次 apply 的其余部分。 */
        const triggers = scoped.get('inputTriggers') as InputTriggersLike | undefined
        if (triggers === undefined || triggers === null || typeof triggers.registerSource !== 'function') {
          warn('inputTriggers service unavailable; @ menu disabled')
          return
        }
        const hint = workspaceHintOf(ctx)
        scoped.effect(() => {
          const dispose = guarded(
            () => triggers.registerSource(createTriggerSource(hint, (key, values) => translate(ctx, key, values))),
            '@ source already registered (stale reload)',
          )
          return () => {
            try {
              dispose()
            } catch {
              /* 已经没了 */
            }
          }
        }, 'related-projects: @ source')
      })

      const slots = ctx.get('slots') as SlotsLike | undefined
      if (slots === undefined || slots === null) return

      const hint = workspaceHintOf(ctx)
      const fallbackT: Translate = (key, values) => translate(ctx, key, values)
      const mount = (name: string, options: Record<string, unknown>, component: unknown): void => {
        ctx.effect(() => slots.inject(name, () => slots.register(
          { name, ...options },
          (props: Record<string, unknown>) => h(component, props),
        )), 'related-projects: ' + name)
      }

      /* 输入框行：会话级，所以工作区来自会话。每会话的 store 建在注册的 inject
         世界里（文档规定的条目私有数据存放处），绝不从组件里创建。 */
      mount('conversation.composer.dock', {
        id: PANEL_ID,
        order: DOCK_ORDER,
        locale: NS,
        inject: (sessionId: string) => ({
          dockStore: dockStoreFor(sessionId, hint),
          workspaceHint: (id: unknown) => hint(String(id ?? '')),
          /* 命名空间没有字典时框架会把 key 原样返回；这一项保证那种情况下屏幕上
             仍有可读的标签。 */
          fallbackT,
        }),
      }, DockRow)

      /* 左侧栏图标 + 它打开的面板（两个 slot 用同一个 id）。 */
      mount('sidebar.panellist', {
        id: PANEL_ID,
        order: ICON_ORDER,
        label: () => translate(ctx, 'panel.title'),
      }, PanelIcon)

      mount('main', {
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ fallbackT }),
      }, Panel)
    },
  }
}

function installStyles(ctx: PluginContext): void {
  const style = document.createElement('style')
  style.setAttribute('data-dsh-related-projects', '')
  style.textContent = CSS
  document.head.appendChild(style)
  ctx.effect(() => () => {
    style.remove()
  }, 'related-projects: styles')
}

/**
 * 服务已存在就立刻跑 `mount`，否则等组合提供它时再跑。尚未提供的服务对裸 `get`
 * 是不可见的，而漏掉的注册是静默的——那样这个位置就会渲染出原始的 key。
 */
function whenProvided(ctx: PluginContext, names: string[], mount: (scoped: PluginContext) => void): void {
  if (typeof ctx.inject === 'function') ctx.inject(names, mount)
  else mount(ctx)
}

/** 一次允许在跟陈旧热重载抢跑时正常输掉的注册。 */
function guarded(register: () => () => void, duplicateMessage: string): () => void {
  try {
    return register()
  } catch (error) {
    warn(duplicateMessage, error)
    return () => {}
  }
}

function warn(message: string, error?: unknown): void {
  if (error === undefined) console.warn('[related-projects] ' + message)
  else console.warn('[related-projects] ' + message, error)
}
