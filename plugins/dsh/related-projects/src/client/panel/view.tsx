/**
 * 管理面板（主栏）：每个 DSH 工作区一个分节。
 *
 * 它不会凭空造出工作区——那份列表属于侧栏。每个分节
 * 只往自己的工作区里添加项目，因此完全没有 "pick a workspace" 这一步。
 *
 * 这是 `main`（keyed / root）里 key 等于侧栏条目 id 的那个条目，所以面板打开
 * 与否由 `ctx.layout` 决定，这里不碰。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { call, pickDirectoryPath } from '../core/api.js'
import { Spinner, Toggle, describeError } from '../core/ui.js'
import { basename } from '../core/reference.js'
import { refreshStores, useSnapshot } from '../core/store.js'
import type { Translate } from '../i18n/index.js'
import { ProjectRow } from './row.js'
import { panelStore } from './store.js'
import { DEFAULT_LIMITS, type ProjectPatch, type ProjectView, type WorkspaceRow } from '../core/types.js'

export interface PanelProps {
  /** 注册项 `locale` 命名空间带来的译员。 */
  t: Translate
}

export function Panel(props: PanelProps): ReactNode {
  const t = props.t
  const snapshot = useSnapshot(panelStore)
  /* 用户展开过的分节。本身已有项目的工作区默认
     展开；那正是这个页面会被访问的理由。 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* 这个 store 的生命周期长于挂载（它是模块级的），可能已经存有
     本页打开之前拍下的快照：绝不能把那一份显示出来。 */
  useEffect(() => {
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

  /** 只改注册表的调用：busy / 报错 / 刷新三件事都收在这里。 */
  const mutate = (method: string, payload: Record<string, unknown>) => run(async () => {
    await call(method, payload)
  })

  const openSection = (workspace: WorkspaceRow): void => {
    setExpanded((prev) => ({ ...prev, [workspace.key]: true }))
  }

  const addTo = (workspace: WorkspaceRow) => run(async () => {
    const path = await pickDirectoryPath()
    if (path === null) return
    await call('add', { workspace: workspace.path, path, notify: true })
    openSection(workspace)
  })

  const update = (workspace: WorkspaceRow, project: ProjectView, patch: ProjectPatch) => mutate('update', {
    workspace: workspace.path,
    id: project.id,
    patch,
    notify: true,
  })

  const remove = (workspace: WorkspaceRow, project: ProjectView) => mutate('remove', {
    workspace: workspace.path,
    id: project.id,
    notify: true,
  })

  /* 打开系统文件管理器是没有状态可刷新的副作用，但
     拒绝仍要告知用户，而不是变成未处理的异常。 */
  const openProject = (workspace: WorkspaceRow, project: ProjectView): void => {
    setNotice(null)
    void call('open', { workspace: workspace.path, id: project.id }).catch((error: unknown) => {
      setNotice(describeError(t, error))
    })
  }

  const copyGroup = (workspace: WorkspaceRow, target: string) => mutate('copy', {
    from: workspace.path,
    to: target,
    notify: true,
  })

  const toggleDock = (next: boolean) => mutate('settings', { alwaysShowDock: next })

  if (snapshot.status === 'error' && data === null) {
    return (
      <div className='rprj-panel'>
        <div className='rprj-error' role='alert'>{describeError(t, snapshot.error)}</div>
      </div>
    )
  }
  if (data === null) {
    return (
      <div className='rprj-panel'>
        <div className='rprj-muted' role='status'><Spinner /> {t('common.loading')}</div>
      </div>
    )
  }

  const isOpen = (workspace: WorkspaceRow): boolean => {
    const recorded = expanded[workspace.key]
    return recorded === undefined ? workspace.projects.length > 0 : recorded
  }

  const sections = workspaces.map((workspace) => {
    const open = isOpen(workspace)
    const targets = copied.filter((group) => group.key !== workspace.key)
    const head = (
      <div className='rprj-ws-head'>
        <button
          type='button'
          className='rprj-ws-toggle'
          aria-expanded={open === true}
          aria-label={open === true ? t('panel.collapse') : t('panel.expand')}
          title={open === true ? t('panel.collapse') : t('panel.expand')}
          onClick={() => setExpanded((prev) => ({ ...prev, [workspace.key]: !open }))}
        >
          <span className='rprj-caret' aria-hidden>{open === true ? '▾' : '▸'}</span>
        </button>
        <div className='rprj-ws-id'>
          <h3 className='rprj-ws-name'>{workspace.title === null ? basename(workspace.path) : workspace.title}</h3>
          <span className='rprj-ws-path'>{workspace.path}</span>
        </div>
        <div className='rprj-ws-actions'>
          <span className='rprj-ws-count'>{t('panel.rows', { n: workspace.projects.length })}</span>
          <button
            type='button'
            className='rprj-btn rprj-btn-primary'
            disabled={busy}
            onClick={() => {
              void addTo(workspace)
            }}
          >
            {t('panel.addHere')}
          </button>
          {workspace.projects.length > 0 && targets.length > 0
            ? (
              <select
                className='rprj-select rprj-select-copy'
                value=''
                disabled={busy}
                title={t('panel.copyTo')}
                aria-label={t('panel.copyTo')}
                onChange={(event) => {
                  const value = event.target.value
                  event.target.value = ''
                  if (value !== '') void copyGroup(workspace, value)
                }}
              >
                <option value=''>{t('panel.copyTo')}</option>
                {targets.map((group) => <option key={group.key} value={group.path}>{group.path}</option>)}
              </select>
            )
            : null}
        </div>
      </div>
    )

    if (open !== true) return <section className='rprj-ws' key={workspace.key}>{head}</section>

    /* 空状态不放自己的 CTA：分节头部的「+ 关联项目」就在旁边，再放一个
       一样的按钮只是重复。手动输路径这条路已经取消——目录选择器覆盖了它。 */
    const body = workspace.projects.length === 0
      ? (
        <div className='rprj-empty'>
          <p>{t('panel.empty')}</p>
          <p className='rprj-muted'>{t('panel.emptyHint')}</p>
        </div>
      )
      : (
        <div className='rprj-rows'>
          {workspace.projects.map((project) => (
            <ProjectRow
              key={project.id}
              t={t}
              project={project}
              busy={busy}
              nameMax={limits.nameMax}
              noteMax={limits.noteMax}
              onUpdate={(patch) => {
                void update(workspace, project, patch)
              }}
              onRemove={() => {
                void remove(workspace, project)
              }}
              onOpen={() => openProject(workspace, project)}
            />
          ))}
        </div>
      )

    return (
      <section className='rprj-ws' key={workspace.key}>
        {head}
        {workspace.registered !== true ? <div className='rprj-ws-warn'>{t('panel.unregistered')}</div> : null}
        {body}
      </section>
    )
  })

  return (
    <div className='rprj-panel' role='region' aria-label={t('panel.title')} aria-busy={busy}>
      <header className='rprj-panel-head'>
        <h2 className='rprj-title'>{t('panel.title')}</h2>
        <p className='rprj-sub'>{t('panel.description')}</p>
      </header>
      {notice !== null ? <div className='rprj-error' role='status' aria-live='polite'>{notice}</div> : null}
      {workspaces.length === 0
        ? <div className='rprj-empty'><p>{t('panel.emptyHint')}</p></div>
        : <div className='rprj-ws-list'>{sections}</div>}
      <footer className='rprj-foot rprj-muted'>
        <span>{t('panel.limit', { n: limits.max })}</span>
        <span className='rprj-grow' />
        <span>{t('panel.showDock')}</span>
        <Toggle
          checked={data.settings.alwaysShowDock !== false}
          label={t('panel.showDock')}
          onChange={(next) => {
            if (busy !== true) void toggleDock(next)
          }}
        />
      </footer>
    </div>
  )
}
