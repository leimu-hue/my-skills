/**
 * 管理面板（主栏）：每个 DSH 工作区一个分节。
 *
 * 它不会凭空造出工作区——那份列表属于侧栏。每个分节
 * 只往自己的工作区里添加项目，因此完全没有 "pick a workspace" 这一步。
 */
import { h, useReact } from '../core/runtime.js'
import { call } from '../core/api.js'
import { Spinner, Toggle, describeError } from '../core/ui.js'
import { basename } from '../core/reference.js'
import { refreshStores, useSnapshot } from '../core/store.js'
import { withFallback, type Translate } from '../i18n/index.js'
import { ProjectRow } from './row.js'
import { panelStore } from './store.js'
import { DEFAULT_LIMITS, type ProjectView, type WorkspaceRow } from '../core/types.js'

export interface PanelProps {
  /** 由注册项的 `locale` 命名空间提供。 */
  t: Translate
  /** 插件自带的词典，用于席位只返回原始 key 的场景。 */
  fallbackT?: Translate
}

export function Panel(props: PanelProps): unknown {
  const React = useReact()
  const t = withFallback(props.t, props.fallbackT ?? props.t)
  const snapshot = useSnapshot(panelStore)
  /* 用户展开过的分节。本身已有项目的工作区默认
     展开；那正是这个页面会被访问的理由。 */
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [manual, setManual] = React.useState<{ key: string; text: string } | null>(null)

  /* 这个 store 的生命周期长于挂载（它是模块级的），可能已经存有
     本页打开之前拍下的快照：绝不能把那一份显示出来。 */
  React.useEffect(() => {
    void panelStore.refresh(true)
  }, [])

  const data = snapshot.data
  const workspaces = data === null ? [] : data.workspaces
  const copied = data === null ? [] : data.groups
  const limits = data === null ? DEFAULT_LIMITS : data.limits

  /* 一次变更 = 刷新所有视图：管理面板与每个已挂载的
     composer 行读的是同一份注册表。 */
  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      await task()
      await refreshStores()
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

  /* 打开系统文件管理器是没有状态可刷新的副作用，但
     拒绝仍要告知用户，而不是变成未处理的异常。 */
  const openProject = (workspace: WorkspaceRow, project: ProjectView): void => {
    setNotice(null)
    void call('open', { workspace: workspace.path, id: project.id }).catch((error: unknown) => {
      setNotice(describeError(t, error))
    })
  }

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
    return h('div', { className: 'rprj-panel' }, h('div', { className: 'rprj-muted' }, h(Spinner), ' ', t('common.loading')))
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
          onClick: () => {
            void addTo(workspace)
          },
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
    h('button', { type: 'button', className: 'rprj-btn rprj-btn-quiet', onClick: () => setManual(null) }, t('common.cancel')))

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
          busy,
          noteMax: limits.noteMax,
          onUpdate: (patch: Record<string, unknown>) => {
            void update(workspace, project, patch)
          },
          onRemove: () => {
            void remove(workspace, project)
          },
          onOpen: () => openProject(workspace, project),
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
        checked: data.settings.alwaysShowDock !== false,
        label: t('panel.showDock'),
        onChange: (next: boolean) => {
          if (busy !== true) void toggleDock(next)
        },
      })))
}
