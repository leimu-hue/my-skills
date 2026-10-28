/**
 * 侧栏图标：按钮由侧栏栏位承载，这里只负责画图形。
 *
 * 和插件清单里那张彩色 `icon.svg` 不同：侧栏图标必须是**单色**（`currentColor`），
 * 才能跟随主题与选中态。所以这里用描边重画了一个 16px 的小标记 —— 圆角方块里
 * 两行文字加一个勾，对应「清单式管理」的含义。
 */
import type { ReactNode } from 'react'

export function ToolCenterIcon(props: { size?: number }): ReactNode {
  const size = typeof props.size === 'number' ? props.size : 16
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 16 16'
      fill='none'
      aria-hidden='true'
    >
      <rect
        x='2.1'
        y='2.1'
        width='11.8'
        height='11.8'
        rx='3'
        stroke='currentColor'
        strokeWidth='1.2'
      />
      <path d='M4.9 5.6h6.2M4.9 8.2h3.5' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path
        d='M5.6 10.9l1.5 1.4 3.2-3.3'
        stroke='currentColor'
        strokeWidth='1.2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
