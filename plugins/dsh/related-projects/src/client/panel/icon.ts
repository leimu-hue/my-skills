/** 侧栏图标：按钮由侧栏栏位承载，这里只负责绘制图形。 */
import { h } from '../core/runtime.js'

export function PanelIcon(props: { size?: number }): unknown {
  const size = typeof props.size === 'number' ? props.size : 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
  },
  h('path', {
    d: 'M1.5 4.2c0-.6.5-1.1 1.1-1.1h3l1.3 1.6h5.4c.6 0 1.1.5 1.1 1.1v5.9c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V4.2Z',
    stroke: 'currentColor',
    strokeWidth: '1.2',
    strokeLinejoin: 'round',
  }),
  h('path', { d: 'M9.2 6.1 6.8 9.9', stroke: 'currentColor', strokeWidth: '1.2', strokeLinecap: 'round' }),
  h('circle', { cx: '9.6', cy: '6.1', r: '1.15', fill: 'currentColor' }),
  h('circle', { cx: '6.4', cy: '9.9', r: '1.15', fill: 'currentColor' }))
}
