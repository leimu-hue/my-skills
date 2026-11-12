/**
 * 客户端插件体：往官方 slot 表里挂两个条目——侧栏图标与主栏面板。
 *
 * 生命周期全部交给 Cordis：`slots.inject(key, () => slots.register(...))` 自带
 * 条目生命周期，`locale.register` 同样返回 disposer，因此都用 `ctx.effect` 收口。
 * 插件卸载即全部撤走，没有热重载残留需要靠 try/catch 兜。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
/* 触发 slot 名称的声明合并：`main` 来自 layout，`sidebar.panellist` 来自 sidebar。 */
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createElement } from 'react'
import { CSS } from './styles.js'
import { NS, EN, ZH } from './i18n/index.js'
import { Panel, type PanelProps } from './panel/view.js'
import { PanelIcon } from './panel/icon.js'

/** 侧栏条目 id，同时也是 `main` 的 key——两者必须相等，面板才会被选中。 */
const PANEL_ID = 'git-worktree'
const ICON_ORDER = 31

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  installStyles(ctx)

  const locale: LocaleRuntime = ctx.locale
  const slots: SlotRegistry = ctx.slots

  /*
   * 会话导航：外壳的 `uiWorkspace` 服务（会话 UI 自己也用它跳会话）。
   * 名字或形状不对时安静退回——面板已经给了会话 id，用户仍能在侧栏找到它。
   */
  const onOpenSession = (sessionId: string): void => {
    try {
      const navigation = ctx.get('uiWorkspace') as { openSession?: (id: string) => void } | undefined
      navigation?.openSession?.(sessionId)
    } catch {
      /* 没有导航服务：保持原位。 */
    }
  }

  /* 一个命名空间、一次注册：字典随插件卸载一起撤走。 */
  ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'git-worktree: dictionaries')
  const t = locale.bind(NS)

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
  }, (props: PanelProps) => createElement(Panel, { ...props, onOpenSession })))
}

/** 一份样式表，注入一次，插件卸载时移除。 */
function installStyles(ctx: Context): void {
  const style = document.createElement('style')
  style.setAttribute('data-dsh-git-worktree', '')
  style.textContent = CSS
  document.head.appendChild(style)
  ctx.effect(() => () => {
    style.remove()
  }, 'git-worktree: styles')
}
