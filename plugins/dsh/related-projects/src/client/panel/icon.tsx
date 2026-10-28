/**
 * 侧栏图标：按钮由 `sidebar.panellist` 承载，这里只负责绘制图形。
 *
 * 入参就是该 slot 的 owner 份额（`SidebarPanelIconOwnerProps`）：`size` 是
 * 侧栏要求的边长，`active` 表示这个面板当前正被主栏展示。
 */
import type { ReactNode } from 'react'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

export function PanelIcon(props: SidebarPanelIconOwnerProps): ReactNode {
  const size = props.size
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 16 16'
      fill='none'
      data-active={props.active}
      aria-hidden
    >
      <path
        d='M1.5 4.2c0-.6.5-1.1 1.1-1.1h3l1.3 1.6h5.4c.6 0 1.1.5 1.1 1.1v5.9c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V4.2Z'
        stroke='currentColor'
        strokeWidth='1.2'
        strokeLinejoin='round'
      />
      <path d='M9.2 6.1 6.8 9.9' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <circle cx='9.6' cy='6.1' r='1.15' fill='currentColor' />
      <circle cx='6.4' cy='9.9' r='1.15' fill='currentColor' />
    </svg>
  )
}
