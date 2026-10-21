/** Small shared controls. Written here rather than imported from the host's
 * primitive package: a plain-JS plugin must not depend on Client internals. */
import { h, useReact } from './runtime.js'
import { ApiError } from './api.js'
import type { Translate } from './locale.js'

export function Toggle(props: {
  t: Translate
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
 * Two-step delete, rendered IN the row.
 *
 * A native `window.confirm()` was the original shortcut; in the desktop shell it
 * paints an OS dialog titled with the app id ("@deepseek-ai/dsh-desktop") that
 * ignores the theme and looks nothing like the panel. This inline strip keeps the
 * consequence visible next to the thing being deleted, and it cannot be dismissed
 * into a state the user has to reason about: 6s of no answer disarms it again.
 */
export function ConfirmButton(props: {
  t: Translate
  title: string
  confirmText: string
  children: unknown
  onConfirm(): void
}): unknown {
  const React = useReact()
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => {
    if (armed !== true) return undefined
    const timer = setTimeout(() => setArmed(false), 6000)
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setArmed(false) }
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
        onClick: () => { setArmed(false); props.onConfirm() },
      }, props.t('panel.deleteYes')),
      h('button', { type: 'button', className: 'rprj-btn', onClick: () => setArmed(false) }, props.t('panel.cancel')))
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

/** One place that turns a failure into the sentence the user reads. */
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
