/**
 * 可交互的控件：按钮、开关、输入、下拉、折叠三角、模态框。
 *
 * 四个域视图原先各写一遍同样的形状，这里收成一处；类名保持原样，所以 `styles.ts` 不用改。
 * 全部只做「画出来」这一件事 —— 点了之后发生什么，由调用方（`lib/` 里的 hook）决定。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { DomainFailure } from '../../lib/core/domain.ts'
import { alertOf } from './atoms.tsx'

export function buttonOf(spec: {
  label: string
  onClick(): void
  disabled?: boolean
  variant?: 'primary' | 'danger'
  small?: boolean
  title?: string
}): ReactNode {
  const classes = ['dsk-btn']
  if (spec.small === true) classes.push('dsk-btn-sm')
  if (spec.variant === 'primary') classes.push('dsk-btn-primary')
  if (spec.variant === 'danger') classes.push('dsk-btn-danger')
  return (
    <button
      type='button'
      className={classes.join(' ')}
      onClick={spec.onClick}
      disabled={spec.disabled}
      title={spec.title}
    >
      {spec.label}
    </button>
  )
}

/** 那颗开关胶囊：`data-on` 决定样式。行内开关要吃掉冒泡，否则会顺带打开详情。 */
export function switchOf(spec: {
  on: boolean
  onClick(): void
  disabled?: boolean
  title?: string
  stopPropagation?: boolean
}): ReactNode {
  return (
    <button
      type='button'
      className='dsk-switch'
      role='switch'
      aria-checked={spec.on}
      aria-label={spec.title}
      data-on={String(spec.on)}
      title={spec.title}
      disabled={spec.disabled}
      onClick={spec.stopPropagation === true
        ? (event) => {
          event.stopPropagation()
          spec.onClick()
        }
        : spec.onClick}
    />
  )
}

export function fieldOf(label: string, control: ReactNode): ReactNode {
  return (
    <div className='dsk-field'>
      <label className='dsk-label'>{label}</label>
      {control}
    </div>
  )
}

export function inputOf(spec: {
  value: string
  onChange(value: string): void
  placeholder?: string
  disabled?: boolean
  className?: string
}): ReactNode {
  return (
    <input
      className={spec.className ?? 'dsk-input'}
      value={spec.value}
      placeholder={spec.placeholder}
      disabled={spec.disabled}
      onChange={(event) => spec.onChange(event.target.value)}
    />
  )
}

export function textAreaOf(spec: { value: string; onChange(value: string): void }): ReactNode {
  return (
    <textarea
      className='dsk-textarea'
      value={spec.value}
      onChange={(event) => spec.onChange(event.target.value)}
    />
  )
}

export function selectOf(spec: {
  value: string
  onChange(value: string): void
  disabled?: boolean
  options: { value: string; label: string }[]
}): ReactNode {
  return (
    <select
      className='dsk-select'
      value={spec.value}
      disabled={spec.disabled}
      onChange={(event) => spec.onChange(event.target.value)}
    >
      {spec.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

/** 折叠三角：`open=false` 时朝右。 */
export function disclosureOf(spec: { open: boolean; title: string; onClick(): void }): ReactNode {
  return (
    <button
      type='button'
      className='dsk-disclosure'
      data-open={String(spec.open)}
      aria-expanded={spec.open}
      title={spec.title}
      onClick={spec.onClick}
    >
      {spec.open ? '▾' : '▸'}
    </button>
  )
}

/** 模态框：mask + head + body + foot，四处一模一样。 */
export function modalOf(title: string, body: ReactNode[], foot: ReactNode[]): ReactNode {
  return (
    <div className='dsk-modal-mask'>
      <div className='dsk-modal' role='dialog' aria-modal='true' aria-label={title}>
        <div className='dsk-modal-head'>{title}</div>
        <div className='dsk-modal-body'>{body}</div>
        <div className='dsk-modal-foot'>{foot}</div>
      </div>
    </div>
  )
}

/** 错误展示：`code` 能翻就翻，翻不了就用宿主给的句子。 */
export function errorAlertOf(t: Translate, failure: DomainFailure): ReactNode {
  const text = failure.code === undefined ? failure.message : translateCode(t, failure.code, failure.message)
  return alertOf(`${t('error.title')}：${text}`, 'err')
}

/** 错误码 → 词典；词典里没有就退回原文。 */
function translateCode(t: Translate, code: string, fallback: string): string {
  const translated = t(code)
  return translated === code ? fallback : translated
}
