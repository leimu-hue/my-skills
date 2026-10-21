/**
 * The composer row: ONE line under the input.
 *
 * The row only carries a count (`N 个关联项目 ▾`). The projects themselves live
 * inside the popover it opens — a strip of chips in the composer crowds the
 * conversation as soon as there are more than two or three projects.
 *
 * The popover closes on outside click and on Escape; there is no dismiss control
 * on the row itself, because hiding the row entirely is a deliberate choice in
 * the panel (a stray click must never make the agent's awareness invisible).
 */
import { h, useReact } from './runtime.js'
import { call } from './api.js'
import { useT } from './locale.js'
import { describeError } from './ui.js'
import { insertMention, type InputActions } from './mention.js'
import { dockStoreFor, useSnapshot, type ProjectView } from './state.js'
import { sessionWorkspace } from './session.js'
import type { Translate } from './locale.js'

export interface DockProps {
  sessionId?: string
  inputActions?: InputActions
  ctx: { get(name: string): unknown }
}

export function DockRow(props: DockProps): unknown {
  const React = useReact()
  const ctx = props.ctx
  const t = useT(ctx)
  const sessionId = props.sessionId
  /* The directory the Client's own catalog knows for this session. It answers
     for a cold (old) session as soon as the session list has loaded — earlier
     than the Host resume that opening such a session starts. */
  const store = React.useMemo(
    () => dockStoreFor(sessionId, (session) => sessionWorkspace(ctx, session)),
    [ctx, sessionId],
  )
  const snapshot = useSnapshot(store)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => { void store.refresh() }, [store])

  /* A snapshot taken while the host was still starting (or right after a plugin
     reload) can report "no workspace"; keep it fresh instead of trusting one
     early answer for the lifetime of the page. Coming back to the app counts
     too: the Host may have finished resuming a session while it was hidden. */
  React.useEffect(() => {
    const refreshNow = (): void => { void store.refresh(true) }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', refreshNow)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', refreshNow)
    }
  }, [store])

  /* Close on Escape, and on any press that lands outside the popover or on the
     toggle that owns it. */
  React.useEffect(() => {
    if (open !== true) return undefined
    const onPress = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) { setOpen(false); return }
      if (target.closest('.rprj-popover') !== null) return
      if (target.closest('.rprj-dock-label') !== null) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPress)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPress)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const data = snapshot.data
  if (snapshot.status === 'error' && data === null) return null
  if (data === null) return null
  if (data.settings.alwaysShowDock === false) return null

  /* "The host could not resolve this session's workspace" is NOT "this workspace
     has no related projects": showing the add prompt here would tell the user
     their list is empty when it is not. Stay silent; the focus refresh above
     re-asks once the host can answer. */
  if (data.workspace === null) return null

  const visible = data.projects.filter((project) => project.enabled !== false)
  const missing = visible.filter((project) => project.exists === false).length

  const onPick = (project: ProjectView): void => {
    if (project.exists === false) {
      setNotice(t('panel.missing'))
      return
    }
    const ok = insertMention(props.inputActions, project.path)
    setNotice(ok === true ? null : t('error.bad-path'))
    if (ok === true) setOpen(false)
  }

  const addViaPicker = async (): Promise<void> => {
    setNotice(null)
    try {
      const picked = await call<{ path?: string }>('pick', {})
      const path = picked.path ?? ''
      if (path === '') return
      /* The session id, not a client-side guess: the host resolves the workspace.
         The catalog hint rides along because an old session's resume may still be
         in flight — without it the add would be refused as "workspace-missing". */
      const workspace = sessionWorkspace(ctx, sessionId)
      await call('add', workspace === ''
        ? { sessionId, path, notify: true }
        : { sessionId, path, workspace, notify: true })
      await store.refresh(true)
    } catch (error) {
      setNotice(describeError(t, error))
    }
  }

  if (visible.length === 0) {
    return h('div', { className: 'rprj-dock' },
      h('div', { className: 'rprj-dock-inner' },
        h('button', { type: 'button', className: 'rprj-dock-add', onClick: addViaPicker }, t('dock.empty')),
        notice !== null ? h('span', { className: 'rprj-notice' }, notice) : null))
  }

  return h('div', { className: 'rprj-dock' },
    h('div', { className: 'rprj-dock-inner' },
      h('button', {
        type: 'button',
        className: 'rprj-dock-label',
        onClick: () => setOpen((value) => !value),
        title: t('dock.applies'),
        'aria-expanded': open === true,
        'aria-haspopup': 'dialog',
      },
      h('span', null, t('dock.label', { n: visible.length })),
      missing > 0 ? h('span', { className: 'rprj-chip-badge' }, '!' + String(missing)) : null,
      h('span', { className: 'rprj-caret', 'aria-hidden': true }, open === true ? '▾' : '▸')),
      notice !== null ? h('span', { className: 'rprj-notice' }, notice) : null),
    open === true ? h(Popover, { t, projects: visible, onClose: () => setOpen(false), onPick }) : null)
}

/** The read-only list, one row per project: click a row to insert its path. */
function Popover(props: {
  t: Translate
  projects: ProjectView[]
  onClose(): void
  onPick(project: ProjectView): void
}): unknown {
  const t = props.t
  return h('div', { className: 'rprj-popover', role: 'dialog', 'aria-label': t('panel.title') },
    h('div', { className: 'rprj-popover-head' },
      h('span', null, t('dock.applies')),
      h('button', {
        type: 'button',
        className: 'rprj-icon-btn',
        onClick: props.onClose,
        'aria-label': t('panel.cancel'),
      }, '×')),
    props.projects.map((project) => h('button', {
      key: project.id,
      type: 'button',
      className: 'rprj-popover-row',
      'data-missing': project.exists === false,
      title: project.exists === false ? t('panel.missing') : project.path,
      onClick: () => props.onPick(project),
    },
    h('span', { className: 'rprj-popover-line' },
      h('span', { className: 'rprj-popover-name', 'data-missing': project.exists === false }, project.name),
      project.exists === false ? h('span', { className: 'rprj-popover-missing' }, t('panel.missing')) : null),
    h('span', { className: 'rprj-popover-path' }, project.path),
    project.note === '' ? null : h('span', { className: 'rprj-popover-note' }, project.note))),
    h('div', { className: 'rprj-popover-foot', role: 'note' }, t('dock.applies')))
}

/** The sidebar icon: the rail owns the button, this only draws the glyph. */
export function PanelIcon(props: { size?: number; active?: boolean }): unknown {
  const size = typeof props.size === 'number' ? props.size : 16
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
  },
  h('path', {
    d: 'M1.5 4.2c0-.6.5-1.1 1.1-1.1h3l1.3 1.6h5.4c.6 0 1.1.5 1.1 1.1v5.9c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V4.2Z',
    stroke: 'currentColor',
    strokeWidth: '1.2',
    strokeLinejoin: 'round',
  }),
  h('path', { d: 'M9.2 6.1 6.8 9.9', stroke: 'currentColor', strokeWidth: '1.2', strokeLinecap: 'round' }),
  h('circle', { cx: '9.6', cy: '6.1', r: '1.15', fill: 'currentColor' }),
  h('circle', { cx: '6.4', cy: '9.9', r: '1.15', fill: 'currentColor' }))
}
