/**
 * 最小的展示原子：徽章、告警条、空状态、弱化说明。
 *
 * 它们是**返回元素的函数**，不是组件：四个域里大量地方要在 `.map()` / 条件分支里取值，
 * 直接调用比 `<Badge/>` 更贴近数据形状，也让「渲染出来的是什么」一眼可见（测试就是
 * 按这个形状断言的）。真正的状态与请求都在 `lib/` 里。
 */
import type { ReactNode } from 'react'

export type BadgeKind = 'ok' | 'warn' | 'off'

export function badgeOf(text: string, kind?: BadgeKind, title?: string): ReactNode {
  const className = kind === undefined ? 'dsk-badge' : `dsk-badge dsk-badge-${kind}`
  return <span className={className} title={title}>{text}</span>
}

export function alertOf(text: string, kind?: 'err'): ReactNode {
  return <div className={kind === 'err' ? 'dsk-alert dsk-alert-err' : 'dsk-alert'}>{text}</div>
}

export function emptyOf(text: string): ReactNode {
  return <div className='dsk-empty'>{text}</div>
}

export function mutedOf(text: string): ReactNode {
  return <div className='dsk-muted'>{text}</div>
}

/**
 * 行内的一段说明（场景说明那类）：折成一行、超长就截断，全文靠 `title` 悬停看。
 *
 * 先按字数截一道再交给 CSS：说明可能很长，没必要为了让省略号出现而把整段塞进 DOM。
 */
export function noteOf(text: string, max = 60): ReactNode {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  if (flat.length <= max) return <span className='dsk-note'>{flat}</span>
  return <span className='dsk-note' title={flat}>{`${flat.slice(0, max)}…`}</span>
}
