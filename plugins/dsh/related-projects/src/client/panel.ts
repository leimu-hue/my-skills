/**
 * The management panel (main column): one section per DSH workspace.
 *
 * It never invents a workspace — that list belongs to the sidebar. Each section
 * adds to its own workspace, so there is no "pick a workspace" step at all.
 */
import { h, useReact } from './runtime.js'
import { call } from './api.js'
import { useT } from './locale.js'
import { ConfirmButton, Spinner, Toggle, describeError } from './ui.js'
import {
  groupStore, refreshDockStores, useSnapshot,
  type ProjectView, type StateValue, type WorkspaceRow,
} from './state.js'
import type { Translate } from './locale.js'

export interface PanelProps {
  ctx: { get(name: string): unknown }
}

export function Panel(props: PanelProps): unknown {
  const React = useReact()
  const ctx = props.ctx
  const t = useT(ctx)
  const snapshot = useSnapshot(groupStore)
  /* Sections the user expanded. A workspace that already holds projects starts
     open; that is the reason this page gets visited. */
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [manual, setManual] = React.useState<{ key: string; text: string } | null>(null)

  React.useEffect(() => { void groupStore.refresh() }, [])

  const data = snapshot.data
  const workspaces = data === null ? [] : data.workspaces
  const copied = data === null ? [] : data.groups
  const limits = data === null ? { max: 10, noteMax: 200, nameMax: 60 } : data.limits

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      await task()
      await groupStore.refresh(true)
      refreshDockStores()
    } catch (error) {
      setNotice(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const pickDirectory = async (): Promise<string | null> => {
    const result = await call<{ path?: string }>('pick', {})
    const path = result.path ?? ''
    return path === '' ? null : path
  }

  const openSection = (workspace: WorkspaceRow): void => {
    setExpanded((prev) => ({ ...prev, [workspace.key]: true }))
  }

  const addTo = (workspace: WorkspaceRow) => run(async () => {
    const path = await pickDirectory()
    if (path === null) return
    await call('add', { workspace: workspace.path, path, notify: true })
    openSection(workspace)
  })

  const submitManual = (workspace: WorkspaceRow) => run(async () => {
    const text = manual === null ? '' : manual.text.trim()
    if (text === '') return
    await call('add', { workspace: workspace.path, path: text, notify: true })
    setManual(null)
    openSection(workspace)
  })

  const update = (workspace: WorkspaceRow, project: ProjectView, patch: Record<string, unknown>) => run(async () => {
    await call('update', { workspace: workspace.path, id: project.id, patch, notify: true })
  })

  const remove = (workspace: WorkspaceRow, project: ProjectView) => run(async () => {
    await call('remove', { workspace: workspace.path, id: project.id, notify: true })
  })

  const copyGroup = (workspace: WorkspaceRow, target: string) => run(async () => {
    await call('copy', { from: workspace.path, to: target, notify: true })
  })

  const toggleDock = (next: boolean) => run(async () => {
    await call('settings', { alwaysShowDock: next })
  })

  if (snapshot.status === 'error' && data === null) {
    return h('div', { className: 'rprj-panel' },
      h('div', { className: 'rprj-error' }, describeError(t, snapshot.error)))
  }
  if (data === null) {
    return h('div', { className: 'rprj-panel' }, h('div', { className: 'rprj-muted' }, h(Spinner), ' ', t('loading')))
  }

  const isOpen = (workspace: WorkspaceRow): boolean => (
    expanded[workspace.key] !== undefined ? expanded[workspace.key] : workspace.projects.length > 0
  )

  const sections = workspaces.map((workspace) => {
    const open = isOpen(workspace)
    const targets = copied.filter((group) => group.key !== workspace.key)
    const head = h('div', { className: 'rprj-ws-head' },
      h('button', {
        type: 'button',
        className: 'rprj-ws-toggle',
        'aria-expanded': open === true,
        title: open === true ? t('panel.collapse') : t('panel.expand'),
        onClick: () => setExpanded((prev) => ({ ...prev, [workspace.key]: !open })),
      }, h('span', { className: 'rprj-caret', 'aria-hidden': true }, open === true ? '▾' : '▸')),
      h('div', { className: 'rprj-ws-id' },
        h('span', { className: 'rprj-ws-name' }, workspace.title === null ? basename(workspace.path) : workspace.title),
        h('span', { className: 'rprj-ws-path' }, workspace.path)),
      h('div', { className: 'rprj-ws-actions' },
        h('span', { className: 'rprj-ws-count' }, t('panel.rows', { n: workspace.projects.length })),
        h('button', {
          type: 'button',
          className: 'rprj-btn rprj-btn-primary',
          disabled: busy,
          onClick: () => { void addTo(workspace) },
        }, t('panel.addHere')),
        workspace.projects.length > 0 && targets.length > 0
          ? h('select', {
            className: 'rprj-select rprj-select-copy',
            value: '',
            disabled: busy,
            title: t('panel.copyTo'),
            onChange: (event: { target: HTMLSelectElement }) => {
              const value = event.target.value
              event.target.value = ''
              if (value !== '') void copyGroup(workspace, value)
            },
          },
          h('option', { value: '' }, t('panel.copyTo')),
          targets.map((group) => h('option', { key: group.key, value: group.path }, group.path)))
          : null))

    if (open !== true) return h('section', { className: 'rprj-ws', key: workspace.key }, head)

    const manualBar = manual === null || manual.key !== workspace.key ? null : h('form', {
      className: 'rprj-bar rprj-ws-manual',
      onSubmit: (event: { preventDefault(): void }) => {
        event.preventDefault()
        void submitManual(workspace)
      },
    },
    h('input', {
      className: 'rprj-input rprj-input-grow',
      value: manual === null ? '' : manual.text,
      placeholder: t('manual.placeholder'),
      autoFocus: true,
      onChange: (event: { target: HTMLInputElement }) => setManual({ key: workspace.key, text: event.target.value }),
    }),
    h('button', {
      type: 'submit',
      className: 'rprj-btn rprj-btn-primary',
      disabled: busy || manual === null || manual.text.trim() === '',
    }, t('manual.ok')),
    h('button', { type: 'button', className: 'rprj-btn rprj-btn-quiet', onClick: () => setManual(null) }, t('panel.cancel')))

    const body = workspace.projects.length === 0
      ? h('div', { className: 'rprj-empty' },
        h('p', null, t('panel.empty')),
        h('p', { className: 'rprj-muted' }, t('panel.emptyHint')),
        h('button', {
          type: 'button',
          className: 'rprj-btn',
          onClick: () => setManual({ key: workspace.key, text: '' }),
        }, t('manual.title')))
      : h('div', { className: 'rprj-rows' },
        workspace.projects.map((project) => h(ProjectRow, {
          key: project.id,
          t,
          project,
          workspace: workspace.path,
          busy,
          noteMax: limits.noteMax,
          onUpdate: (patch: Record<string, unknown>) => { void update(workspace, project, patch) },
          onRemove: () => { void remove(workspace, project) },
        })),
        h('button', {
          type: 'button',
          className: 'rprj-btn rprj-btn-quiet rprj-row-add',
          onClick: () => setManual({ key: workspace.key, text: '' }),
        }, t('manual.title')))

    return h('section', { className: 'rprj-ws', key: workspace.key },
      head,
      workspace.registered !== true ? h('div', { className: 'rprj-ws-warn' }, t('panel.unregistered')) : null,
      manualBar,
      body)
  })

  return h('div', { className: 'rprj-panel' },
    h('header', { className: 'rprj-panel-head' },
      h('h2', { className: 'rprj-title' }, t('panel.title')),
      h('p', { className: 'rprj-sub' }, t('panel.description'))),
    notice !== null ? h('div', { className: 'rprj-error' }, notice) : null,
    workspaces.length === 0
      ? h('div', { className: 'rprj-empty' }, h('p', null, t('panel.emptyHint')))
      : h('div', { className: 'rprj-ws-list' }, sections),
    h('footer', { className: 'rprj-foot rprj-muted' },
      h('span', null, t('panel.limit', { n: limits.max })),
      h('span', { className: 'rprj-grow' }),
      h('span', null, t('panel.showDock')),
      h(Toggle, {
        t,
        checked: data.settings.alwaysShowDock !== false,
        label: t('panel.showDock'),
        onChange: (next: boolean) => { if (busy !== true) void toggleDock(next) },
      })))
}

interface RowProps {
  t: Translate
  project: ProjectView
  workspace: string
  busy: boolean
  noteMax: number
  onUpdate(patch: Record<string, unknown>): void
  onRemove(): void
}

function ProjectRow(props: RowProps): unknown {
  const React = useReact()
  const t = props.t
  const project = props.project
  const [name, setName] = React.useState(project.name)
  const [note, setNote] = React.useState(project.note)

  React.useEffect(() => { setName(project.name) }, [project.name])
  React.useEffect(() => { setNote(project.note) }, [project.note])

  const commitName = (): void => {
    const next = name.trim()
    if (next === '') { setName(project.name); return }
    if (next !== project.name) props.onUpdate({ name: next })
  }

  return h('div', { className: 'rprj-row', 'data-missing': project.exists === false },
    h('div', { className: 'rprj-row-head' },
      h('input', {
        className: 'rprj-input rprj-input-name',
        value: name,
        placeholder: t('panel.namePlaceholder'),
        disabled: props.busy,
        onChange: (event: { target: HTMLInputElement }) => setName(event.target.value),
        onBlur: commitName,
        onKeyDown: (event: { key: string; currentTarget: HTMLInputElement }) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        },
      }),
      project.origin === 'agent' ? h('span', { className: 'rprj-tag' }, t('panel.agentAdded')) : null,
      project.exists === false ? h('span', { className: 'rprj-tag rprj-tag-error' }, t('panel.missing')) : null,
      h('span', { className: 'rprj-grow' }),
      h(Toggle, {
        t,
        checked: project.enabled !== false,
        label: t('panel.enabled'),
        onChange: (next: boolean) => props.onUpdate({ enabled: next }),
      }),
      h('button', {
        type: 'button',
        className: 'rprj-btn rprj-btn-quiet',
        title: t('panel.open'),
        onClick: () => { void call('open', { workspace: props.workspace, id: project.id }) },
      }, '↗'),
      h(ConfirmButton, {
        t,
        title: t('panel.delete'),
        confirmText: t('panel.deleteConfirm', { name: project.name }),
        onConfirm: props.onRemove,
      }, t('panel.delete'))),
    h('div', { className: 'rprj-row-path' }, project.path),
    h('textarea', {
      className: 'rprj-textarea',
      rows: 2,
      value: note,
      placeholder: t('panel.notePlaceholder'),
      maxLength: props.noteMax,
      disabled: props.busy,
      onChange: (event: { target: HTMLTextAreaElement }) => setNote(event.target.value),
      onBlur: () => {
        if (note !== project.note) props.onUpdate({ note })
      },
    }))
}

export function basename(path: string): string {
  const parts = String(path).replace(/\\/g, '/').split('/').filter((part) => part !== '')
  return parts.length === 0 ? String(path) : parts[parts.length - 1]
}

export type { StateValue }
