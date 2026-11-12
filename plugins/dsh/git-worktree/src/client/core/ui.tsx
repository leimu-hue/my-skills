/** 小型共享控件。样式全部走 styles.ts 的 `.wt-*` 类，不引外部 UI 包。 */
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from './api.js'
import { ZH, type Translate, type TranslateKey } from '../i18n/index.js'

export function Spinner(): ReactNode {
  return <span className='wt-spinner' aria-hidden />
}

/** 两步确认：把后果留在待删项旁边，6 秒无响应自动解除。 */
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
      <span className='wt-confirm' role='group' aria-live='polite'>
        <span className='wt-confirm-text'>{props.confirmText}</span>
        <button
          type='button'
          className='wt-btn wt-btn-danger'
          onClick={() => {
            setArmed(false)
            props.onConfirm()
          }}
        >
          {props.confirmLabel}
        </button>
        <button type='button' className='wt-btn' autoFocus onClick={() => setArmed(false)}>
          {props.cancelLabel}
        </button>
      </span>
    )
  }
  return (
    <button type='button' className='wt-btn wt-btn-quiet wt-btn-delete' title={props.title} onClick={() => setArmed(true)}>
      {props.children}
    </button>
  )
}

function isTranslateKey(key: string): key is TranslateKey {
  return Object.prototype.hasOwnProperty.call(ZH, key)
}

/**
 * 把失败变成用户读到的那句话，只此一处。错误码是 Host 在运行期发来的字符串：
 * 先确认它真的在字典里，再当键用；不认识就退回宿主给的 message。
 */
export function describeError(t: Translate, error: unknown): string {
  if (error instanceof ApiError) {
    const key = 'error.' + error.code
    if (isTranslateKey(key)) return t(key)
    return error.message === '' ? t('error.generic') : error.message
  }
  if (error instanceof Error && error.message !== '') return error.message
  return t('error.generic')
}
