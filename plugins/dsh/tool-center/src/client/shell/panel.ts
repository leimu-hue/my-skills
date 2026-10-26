/**
 * 主栏面板的外壳。
 *
 * 面板挂在主栏（`main` 栏位）而不是设置页里，所以它得自己负责「整块占满 + 自己滚动 +
 * 自己的内边距」——这部分不能让页签外壳（`page.ts`，原本按设置页排版）来猜。
 * 内层仍然是那份页签外壳，四个域视图一行都不用改。
 *
 * 它还发布「内容区左上边界」两个 CSS 变量：详情抽屉是 `position:fixed` 的遮罩，若铺满
 * 整个窗口就会盖住原生标题栏（右上角的最小化 / 最大化 / 关闭），用户会以为那三个按钮
 * 属于抽屉、一按就把主窗口关了。把边界实测量出来，既避开标题栏，也不会把 DSH 自己的
 * 左侧栏一起变暗。
 */
import { h, useClientEffect, useReact } from '../core/runtime.js'
import { ToolCenterPage } from '../page.js'

/** 抽屉遮罩的边界变量名（见 styles.ts 的 `.dsk-panel-mask`）。 */
const TOP_VAR = '--dsk-content-top'
const LEFT_VAR = '--dsk-content-left'

export function ToolCenterPanel(props: Record<string, unknown>): unknown {
  const React = useReact()
  const root = React.useRef<unknown>(null)

  useClientEffect(() => {
    const publish = (): void => {
      const node = root.current as { getBoundingClientRect?(): { top: number; left: number } } | null
      const rect = typeof node?.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : undefined
      const style = document.documentElement.style
      style.setProperty(TOP_VAR, `${Math.max(0, Math.round(rect?.top ?? 0))}px`)
      style.setProperty(LEFT_VAR, `${Math.max(0, Math.round(rect?.left ?? 0))}px`)
    }
    publish()
    // 挂载那一拍可能还没完成布局，下一帧再量一次。
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(publish) : 0
    window.addEventListener('resize', publish)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('resize', publish)
      document.documentElement.style.removeProperty(TOP_VAR)
      document.documentElement.style.removeProperty(LEFT_VAR)
    }
  }, [])

  return h('div', { className: 'dsk-page', ref: root },
    h(ToolCenterPage as never, props))
}
