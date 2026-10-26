/**
 * 共用渲染原子。
 *
 * 四个域视图（技能 / 提示词 / MCP / 场景）原先各写一遍同样的外壳：标题行 + 徽章 + 告警、
 * 分组头 + 路径 + 动作、模态框三段、字段 + 标签、按钮 / 开关 / 输入框。这里把那些形状收成
 * 一处，样式类名保持原样，所以 `styles.ts` 不用改。
 */
import { h } from './runtime.js'
import type { Translate } from '../i18n/index.js'
import type { DomainFailure } from './domain.js'

export type BadgeKind = 'ok' | 'warn' | 'off'

export function badgeOf(text: string, kind?: BadgeKind, title?: string): unknown {
  const className = kind === undefined ? 'dsk-badge' : `dsk-badge dsk-badge-${kind}`
  return h('span', title === undefined ? { className } : { className, title }, text)
}

export function alertOf(text: string, kind?: 'err'): unknown {
  return h('div', { className: kind === 'err' ? 'dsk-alert dsk-alert-err' : 'dsk-alert' }, text)
}

export function emptyOf(text: string): unknown {
  return h('div', { className: 'dsk-empty' }, text)
}

export function mutedOf(text: string): unknown {
  return h('div', { className: 'dsk-muted' }, text)
}

/** 视图页头：标题行 + 副标题 + 说明 + 告警，四个域的页头都是这个形状。 */
export function headOf(spec: {
  title: string
  badges?: unknown[]
  subtitle?: string
  muted?: string
  alerts?: unknown[]
}): unknown {
  return h('div', { className: 'dsk-head' },
    h('div', { className: 'dsk-title-row' },
      h('h3', { className: 'dsk-title' }, spec.title),
      ...(spec.badges ?? [])),
    spec.subtitle === undefined ? null : h('p', { className: 'dsk-sub' }, spec.subtitle),
    spec.muted === undefined ? null : h('p', { className: 'dsk-muted' }, spec.muted),
    ...(spec.alerts ?? []))
}

export function toolbarOf(children: unknown[]): unknown {
  return h('div', { className: 'dsk-toolbar' }, ...children)
}

export function actionsOf(children: unknown[]): unknown {
  return h('div', { className: 'dsk-actions' }, ...children)
}

export function listOf(children: unknown[]): unknown {
  return h('div', { className: 'dsk-list' }, ...children)
}

/** 一个分组（来源 / 预设 / 场景 / 服务器）：外框 + 一条头 + 内容。 */
export function groupOf(key: string, head: unknown[], children: unknown[]): unknown {
  return h('div', { className: 'dsk-group', key }, h('div', { className: 'dsk-group-head' }, ...head), ...children)
}

export function groupLineOf(name: string, badges: unknown[], actions: unknown | null): unknown {
  return h('div', { className: 'dsk-group-line' },
    h('span', { className: 'dsk-group-name' }, name),
    ...badges,
    actions)
}

export function groupPathOf(text: string, title?: string): unknown {
  return h('div', { className: 'dsk-group-path', title: title ?? text }, text)
}

export function groupActionsOf(children: unknown[]): unknown {
  return h('div', { className: 'dsk-group-actions' }, ...children)
}

export function buttonOf(spec: {
  label: string
  onClick(): void
  disabled?: boolean
  variant?: 'primary' | 'danger'
  small?: boolean
  title?: string
}): unknown {
  const classes = ['dsk-btn']
  if (spec.small === true) classes.push('dsk-btn-sm')
  if (spec.variant === 'primary') classes.push('dsk-btn-primary')
  if (spec.variant === 'danger') classes.push('dsk-btn-danger')
  const props: Record<string, unknown> = { className: classes.join(' '), onClick: spec.onClick }
  if (spec.disabled !== undefined) props.disabled = spec.disabled
  if (spec.title !== undefined) props.title = spec.title
  return h('button', props, spec.label)
}

/** 那颗开关胶囊：`data-on` 决定样式。行内开关要吃掉冒泡，否则会顺带打开详情。 */
export function switchOf(spec: {
  on: boolean
  onClick(): void
  disabled?: boolean
  title?: string
  stopPropagation?: boolean
}): unknown {
  const props: Record<string, unknown> = {
    className: 'dsk-switch',
    'data-on': String(spec.on),
    onClick: spec.stopPropagation === true
      ? (event: { stopPropagation(): void }) => {
        event.stopPropagation()
        spec.onClick()
      }
      : spec.onClick,
  }
  if (spec.title !== undefined) props.title = spec.title
  if (spec.disabled !== undefined) props.disabled = spec.disabled
  return h('button', props)
}

export function fieldOf(label: string, control: unknown): unknown {
  return h('div', { className: 'dsk-field' },
    h('label', { className: 'dsk-label' }, label),
    control)
}

type ValueEvent = { target: { value: string } }

export function inputOf(spec: {
  value: string
  onChange(value: string): void
  placeholder?: string
  disabled?: boolean
  className?: string
}): unknown {
  const props: Record<string, unknown> = {
    className: spec.className ?? 'dsk-input',
    value: spec.value,
    onChange: (event: ValueEvent) => spec.onChange(event.target.value),
  }
  if (spec.placeholder !== undefined) props.placeholder = spec.placeholder
  if (spec.disabled !== undefined) props.disabled = spec.disabled
  return h('input', props)
}

export function textAreaOf(spec: { value: string; onChange(value: string): void }): unknown {
  return h('textarea', {
    className: 'dsk-textarea',
    value: spec.value,
    onChange: (event: ValueEvent) => spec.onChange(event.target.value),
  })
}

export function selectOf(spec: {
  value: string
  onChange(value: string): void
  disabled?: boolean
  options: { value: string; label: string }[]
}): unknown {
  const props: Record<string, unknown> = {
    className: 'dsk-select',
    value: spec.value,
    onChange: (event: ValueEvent) => spec.onChange(event.target.value),
  }
  if (spec.disabled !== undefined) props.disabled = spec.disabled
  return h('select', props, spec.options.map((option) => h('option', { value: option.value, key: option.value }, option.label)))
}

/** 模态框：mask + head + body + foot，四处一模一样。 */
export function modalOf(title: string, body: unknown[], foot: unknown[]): unknown {
  return h('div', { className: 'dsk-modal-mask' },
    h('div', { className: 'dsk-modal' },
      h('div', { className: 'dsk-modal-head' }, title),
      h('div', { className: 'dsk-modal-body' }, ...body),
      h('div', { className: 'dsk-modal-foot' }, ...foot)))
}

/** 错误展示：`code` 能翻就翻，翻不了就用宿主给的句子。 */
export function errorAlertOf(t: Translate, failure: DomainFailure): unknown {
  const text = failure.code === undefined ? failure.message : translateCode(t, failure.code, failure.message)
  return alertOf(`${t('error.title')}：${text}`, 'err')
}

/** 错误码 → 词典；词典里没有就退回原文。 */
export function translateCode(t: Translate, code: string, fallback: string): string {
  const translated = t(code)
  return translated === code ? fallback : translated
}
