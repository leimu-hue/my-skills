/**
 * 主栏面板的外壳。
 *
 * 面板挂在主栏（`main` 栏位）而不是设置页里，所以它得自己负责「整块占满 + 自己滚动 +
 * 自己的内边距」——这部分不能让页签外壳（`page.ts`，原本按设置页排版）来猜。
 * 内层仍然是那份页签外壳，四个域视图一行都不用改。
 */
import { h } from '../core/runtime.js'
import { ToolCenterPage } from '../page.js'

export function ToolCenterPanel(props: Record<string, unknown>): unknown {
  return h('div', { className: 'dsk-page' },
    h(ToolCenterPage as never, props))
}
