/**
 * 侧栏图标：按钮由 `sidebar.panellist` 承载，这里只负责绘制图形。
 *
 * 入参是该 slot 的 owner 份额（`size` 是侧栏要求的边长，`active` 表示这个面板
 * 当前正被主栏展示）。
 */
import type { ReactNode } from 'react'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

export function PanelIcon(props: SidebarPanelIconOwnerProps): ReactNode {
  const size = props.size
  return (
    <svg width={size} height={size} viewBox='0 0 16 16' fill='none' data-active={props.active} aria-hidden>
      <path d='M4.5 13V3.5' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <circle cx='4.5' cy='13.4' r='1.1' fill='currentColor' />
      <path d='M4.5 9.2c0-2 1.6-2.6 3.4-3.1' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <rect x='8.4' y='4.2' width='5.6' height='3.6' rx='1' stroke='currentColor' strokeWidth='1.1' />
      <rect x='8.4' y='9.4' width='5.6' height='3.6' rx='1' stroke='currentColor' strokeWidth='1.1' />
    </svg>
  )
}
