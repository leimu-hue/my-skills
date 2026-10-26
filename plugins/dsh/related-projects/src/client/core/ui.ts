/** 小型共享控件。写在这里而不是从 Host 的 primitive 包引入：纯 JS 插件不该依赖
 * Client 内部实现。 */
import { h, useReact } from './runtime.js'
import { ApiError } from './api.js'
import type { Translate } from '../i18n/index.js'

export function Toggle(props: {
  checked: boolean
  label: string
  onChange(next: boolean): void
}): unknown {
  return h('button', {
    type: 'button',
    className: 'rprj-toggle',
    role: 'switch',
    'aria-checked': props.checked === true,
    'aria-label': props.label,
    title: props.label,
    onClick: () => props.onChange(props.checked !== true),
  }, h('span', { className: 'rprj-toggle-knob' }))
}

/**
 * 两步删除，直接渲染在行内。
 *
 * 最初的做法是原生 `window.confirm()`；在桌面外壳里它会弹出标题为应用 id
 * （"@deepseek-ai/dsh-desktop"）的 OS 对话框，既不顾主题，也跟面板毫不相像。
 * 这条内联确认带把后果留在待删项旁边，而且不会被关成需要用户自己琢磨的状态：
 * 6 秒无响应就重新解除。
 *
 * 标签由外部传入：这个控件不认任何消息 key，因此任何功能的文案都能直接复用它。
 */
export function ConfirmButton(props: {
  title: string
  confirmText: string
  confirmLabel: string
  cancelLabel: string
  children: unknown
  onConfirm(): void
}): unknown {
  const React = useReact()
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => {
    if (armed !== true) return undefined
    const timer = setTimeout(() => setArmed(false), 6000)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setArmed(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [armed])

  if (armed === true) {
    return h('span', { className: 'rprj-confirm', role: 'group' },
      h('span', { className: 'rprj-confirm-text' }, props.confirmText),
      h('button', {
        type: 'button',
        className: 'rprj-btn rprj-btn-danger',
        autoFocus: true,
        onClick: () => {
          setArmed(false)
          props.onConfirm()
        },
      }, props.confirmLabel),
      h('button', { type: 'button', className: 'rprj-btn', onClick: () => setArmed(false) }, props.cancelLabel))
  }
  return h('button', {
    type: 'button',
    className: 'rprj-btn rprj-btn-quiet rprj-btn-delete',
    title: props.title,
    onClick: () => setArmed(true),
  }, props.children)
}

export function Spinner(): unknown {
  return h('span', { className: 'rprj-spinner', 'aria-hidden': true })
}

/** 把失败变成用户读到的那句话，只此一处。 */
export function describeError(t: Translate, error: unknown): string {
  if (error instanceof ApiError) {
    const key = 'error.' + error.code
    const text = t(key)
    if (text !== key) return text
    return error.message === '' ? t('error.generic') : error.message
  }
  if (error instanceof Error && error.message !== '') return error.message
  return t('error.generic')
}
