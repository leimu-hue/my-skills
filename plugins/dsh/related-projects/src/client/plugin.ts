/**
 * 客户端插件体：往官方 slot 表里挂三个条目，并（若在场）注册 `@` 触发源。
 * 这里不渲染任何东西——每个条目都指向一个自己管数据的组件。
 *
 * 生命周期全部交给 Cordis：
 *   - `slots.inject(key, () => slots.register(...))` 自带条目生命周期，等待
 *     slot 被声明；`locale.register`、`inputTriggers.registerSource` 同样返回
 *     disposer，因此都用 `ctx.effect` 收口。插件卸载即全部撤走，没有热重载
 *     残留需要靠 try/catch 兜。
 *   - `slots` 与 `locale` 是硬依赖（写在 `inject` 里）：没有 slot 表就没东西
 *     可挂载，而声明了 `locale: NS` 的条目必须有 locale 面才能渲染。
 *     `inputTriggers` 则可选，用 `ctx.inject` 等它就位。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { CSS } from './styles.js'
import { NS, EN, ZH } from './i18n/index.js'
import { dockStoreFor } from './dock/store.js'
import { DockRow } from './dock/view.js'
import { Panel } from './panel/view.js'
import { PanelIcon } from './panel/icon.js'
import { createTriggerSource } from './menu/source.js'

/** 侧栏条目 id，同时也是 `main` 的 key——两者必须相等，面板才会被选中。 */
const PANEL_ID = 'related-projects'
const DOCK_ORDER = 60
const ICON_ORDER = 30

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  installStyles(ctx)

  const locale: LocaleRuntime = ctx.locale
  const slots: SlotRegistry = ctx.slots

  /* 一个命名空间、一次注册：字典随插件卸载一起撤走。 */
  ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'related-projects: dictionaries')
  const t = locale.bind(NS)

  /* 输入框下方条：会话级，所以工作区来自会话。每会话的 store 建在注册项的
     inject 世界里（条目私有数据的存放处），绝不从组件里创建。 */
  slots.inject('conversation.composer.dock', () => slots.register({
    name: 'conversation.composer.dock',
    id: PANEL_ID,
    order: DOCK_ORDER,
    locale: NS,
    inject: (sessionId) => ({ dockStore: dockStoreFor(String(sessionId)) }),
  }, DockRow))

  /* 左侧栏图标：标题由 list 元数据（`label`）提供，侧栏负责按钮本身。 */
  slots.inject('sidebar.panellist', () => slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: ICON_ORDER,
    label: () => t('panel.title'),
  }, PanelIcon))

  /* 管理面板本体：`key` 与侧栏 id 相同，选中侧栏条目即渲染它。 */
  slots.inject('main', () => slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, Panel))

  /* `@` 源：行与 pick 语义归本插件，菜单 UI、键盘与分组都归 input-trigger。 */
  ctx.inject(['inputTriggers'], (scope) => {
    const triggers: InputTriggerServiceContract = scope.inputTriggers
    scope.effect(() => triggers.registerSource(createTriggerSource(t)), 'related-projects: @ source')
  })
}

/** 一份样式表，注入一次，插件卸载时移除。 */
function installStyles(ctx: Context): void {
  const style = document.createElement('style')
  style.setAttribute('data-dsh-related-projects', '')
  style.textContent = CSS
  document.head.appendChild(style)
  ctx.effect(() => () => {
    style.remove()
  }, 'related-projects: styles')
}
