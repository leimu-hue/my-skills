/** 小型共享控件。样式全部走 styles.ts 的 `.rprj-*` 类，不引外部 UI 包。 */
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from './api.js'
import { ZH, type Translate, type TranslateKey } from '../i18n/index.js'

export function Toggle(props: {
  checked: boolean
  label: string
  onChange(next: boolean): void
}): ReactNode {
  return (
    <button
      type='button'
      className='rprj-toggle'
      role='switch'
      aria-checked={props.checked === true}
      aria-label={props.label}
      title={props.label}
      onClick={() => props.onChange(props.checked !== true)}
    >
      <span className='rprj-toggle-knob' />
    </button>
  )
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
  children: ReactNode
  onConfirm(): void
}): ReactNode {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
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
    return (
      <span className='rprj-confirm' role='group' aria-live='polite'>
        <span className='rprj-confirm-text'>{props.confirmText}</span>
        <button
          type='button'
          className='rprj-btn rprj-btn-danger'
          onClick={() => {
            setArmed(false)
            props.onConfirm()
          }}
        >
          {props.confirmLabel}
        </button>
        <button type='button' className='rprj-btn' autoFocus onClick={() => setArmed(false)}>
          {props.cancelLabel}
        </button>
      </span>
    )
  }
  return (
    <button
      type='button'
      className='rprj-btn rprj-btn-quiet rprj-btn-delete'
      title={props.title}
      onClick={() => setArmed(true)}
    >
      {props.children}
    </button>
  )
}

export function Spinner(): ReactNode {
  return <span className='rprj-spinner' aria-hidden />
}

/**
 * 把失败变成用户读到的那句话，只此一处。
 *
 * 错误码是 Host 在运行期发来的字符串：先确认它真的在字典里，再当键用；
 * 不认识就退回宿主给的 message，最后才是通用支。
 */
function isTranslateKey(key: string): key is TranslateKey {
  return Object.prototype.hasOwnProperty.call(ZH, key)
}

export function describeError(t: Translate, error: unknown): string {
  if (error instanceof ApiError) {
    const key = 'error.' + error.code
    if (isTranslateKey(key)) return t(key)
    return error.message === '' ? t('error.generic') : error.message
  }
  if (error instanceof Error && error.message !== '') return error.message
  return t('error.generic')
}
