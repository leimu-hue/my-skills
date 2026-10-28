/**
 * 版面骨架：页头、工具栏、动作条、列表、分组。
 *
 * 四个域的页头与分组是同一个形状（标题行 + 徽章 + 说明 + 告警；分组头 + 路径 + 动作），
 * 所以这里只保留一份 —— 改一处，四个页面一起跟上。
 */
import type { ReactNode } from 'react'

/** 视图页头：标题行 + 副标题 + 说明 + 告警，四个域的页头都是这个形状。 */
export function headOf(spec: {
  title: string
  badges?: ReactNode[]
  subtitle?: string
  muted?: string
  alerts?: ReactNode[]
}): ReactNode {
  return (
    <div className='dsk-head'>
      <div className='dsk-title-row'>
        <h3 className='dsk-title'>{spec.title}</h3>
        {spec.badges}
      </div>
      {spec.subtitle === undefined ? null : <p className='dsk-sub'>{spec.subtitle}</p>}
      {spec.muted === undefined ? null : <p className='dsk-muted'>{spec.muted}</p>}
      {spec.alerts}
    </div>
  )
}

export function toolbarOf(children: ReactNode[]): ReactNode {
  return <div className='dsk-toolbar'>{children}</div>
}

export function actionsOf(children: ReactNode[]): ReactNode {
  return <div className='dsk-actions'>{children}</div>
}

export function listOf(children: ReactNode[]): ReactNode {
  return <div className='dsk-list'>{children}</div>
}

/** 一个分组（来源 / 预设 / 场景 / 服务器）：外框 + 一条头 + 内容。 */
export function groupOf(key: string, head: ReactNode[], children: ReactNode[]): ReactNode {
  return (
    <div className='dsk-group' key={key}>
      <div className='dsk-group-head'>{head}</div>
      {children}
    </div>
  )
}

/** 分组头的一行：可选的展开/折叠按钮、名字、徽章、操作。 */
export function groupLineOf(name: string, badges: ReactNode[], actions: ReactNode, leading?: ReactNode): ReactNode {
  return (
    <div className='dsk-group-line'>
      {leading ?? null}
      <span className='dsk-group-name'>{name}</span>
      {badges}
      {actions}
    </div>
  )
}

export function groupPathOf(text: string, title?: string): ReactNode {
  return <div className='dsk-group-path' title={title ?? text}>{text}</div>
}

export function groupActionsOf(children: ReactNode[]): ReactNode {
  return <div className='dsk-group-actions'>{children}</div>
}
