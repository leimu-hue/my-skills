/**
 * 输入框下方条：输入框下面只占一行。
 *
 * 条上只带一个计数（`N 个关联项目 ▾`）；项目本身住在它打开的弹层里——
 * 在输入框下方铺一排 chip，只要项目超过两三个，
 * 就会把对话挤得满满当当。
 *
 * 弹层在点击外部与按 Escape 时关闭；条上不提供隐藏控件，因为要整体隐藏
 * 这一条，得去面板里刻意操作（随手一点绝不能让
 * 模型对这些项目的感知无声消失）。
 *
 * 这是 `conversation.composer.dock`（list / session）的一个条目：`sessionId`、
 * `inputActions` 与 `t` 都由框架按 slot 契约注入，`dockStore` 来自注册项的
 * `inject` 工厂——组件自己不创建任何数据源。
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { call, pickDirectoryPath, sessionPayload } from '../core/api.js'
import { insertMention } from '../core/reference.js'
import { describeError } from '../core/ui.js'
import { useSnapshot, type Store } from '../core/store.js'
import type { Translate } from '../i18n/index.js'
import type { ProjectView } from '../core/types.js'

export interface DockRowProps {
  /** 框架标准席位：本会话 id。 */
  sessionId: SessionId
  /** 框架标准席位：本会话的输入动作。 */
  inputActions: InputActions
  /** 注册项 `locale` 命名空间带来的译员。 */
  t: Translate
  /** 注册项 `inject` 环境里按会话创建的 store。 */
  dockStore: Store
}

export function DockRow(props: DockRowProps): ReactNode {
  const t = props.t
  const sessionId = props.sessionId
  const store = props.dockStore
  const snapshot = useSnapshot(store)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()

  /* 显式关闭（Escape / 关闭按钮）后把焦点还给开关；选中一行则不动焦点——
     焦点应该落在 composer，那里才是用户接下来要打字的地方。 */
  const closePopover = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    void store.refresh()
  }, [store])

  /* 在 Host 还在启动时（或插件刚重载后）取到的快照，
     可能报「没有工作区」；要让它保持新鲜，而不是拿
     一个早期答案用满整个页面生命周期。回到应用也算一次：
     Host 可能已经在页面隐藏期间把会话恢复完了。 */
  useEffect(() => {
    const refreshNow = (): void => {
      /* 隐藏时也会触发 visibilitychange：只在真的回到可见时再问。 */
      if (document.visibilityState === 'hidden') return
      void store.refresh(true)
    }
    window.addEventListener('focus', refreshNow)
    document.addEventListener('visibilitychange', refreshNow)
    return () => {
      window.removeEventListener('focus', refreshNow)
      document.removeEventListener('visibilitychange', refreshNow)
    }
  }, [store])

  /* 按 Escape 关闭；弹层之外、
     或它那个开关上的按下，同样关闭。 */
  useEffect(() => {
    if (open !== true) return undefined
    const onPress = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) {
        setOpen(false)
        return
      }
      if (target.closest('.rprj-popover') !== null) return
      if (target.closest('.rprj-dock-label') !== null) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPress)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPress)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const data = snapshot.data
  /* 「Host 解析不出这个会话的工作区」并不等于「这个工作区
     没有关联项目」：这里若显示添加提示，就等于告诉用户
     列表是空的，而事实并非如此。这里保持沉默；上面的焦点刷新
     会在 Host 能回答时再问一次。 */
  if (data === null || data.workspace === null) return null
  if (data.settings.alwaysShowDock === false) return null

  const visible = data.projects.filter((project) => project.enabled)
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
      const path = await pickDirectoryPath()
      if (path === null) return
      /* 传会话 id 而不是 Client 猜的目录：工作区由 Host 从会话解析。 */
      await call('add', sessionPayload(String(sessionId), { path, notify: true }))
      await store.refresh(true)
    } catch (error) {
      setNotice(describeError(t, error))
    }
  }

  if (visible.length === 0) {
    return (
      <div className='rprj-dock'>
        <div className='rprj-dock-inner'>
          <button type='button' className='rprj-dock-add' onClick={addViaPicker}>
            {t('dock.empty')}
          </button>
          {notice !== null ? <span className='rprj-notice' role='status' aria-live='polite'>{notice}</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className='rprj-dock'>
      <div className='rprj-dock-inner'>
        <button
          ref={triggerRef}
          type='button'
          className='rprj-dock-label'
          onClick={() => setOpen((value) => !value)}
          title={t('dock.applies')}
          aria-expanded={open === true}
          aria-haspopup='dialog'
          aria-controls={open === true ? popoverId : undefined}
          aria-label={missing > 0
            ? t('dock.labelMissing', { n: visible.length, m: missing })
            : t('dock.label', { n: visible.length })}
        >
          <span>{t('dock.label', { n: visible.length })}</span>
          {missing > 0 ? <span className='rprj-chip-badge' aria-hidden>{'!' + String(missing)}</span> : null}
          <span className='rprj-caret' aria-hidden>{open === true ? '▾' : '▸'}</span>
        </button>
        {notice !== null ? <span className='rprj-notice' role='status' aria-live='polite'>{notice}</span> : null}
      </div>
      {open === true
        ? <Popover id={popoverId} t={t} projects={visible} onClose={closePopover} onPick={onPick} />
        : null}
    </div>
  )
}

/** 只读列表，每个项目一行：点一行即插入它的路径。 */
function Popover(props: {
  id: string
  t: Translate
  projects: ProjectView[]
  onClose(): void
  onPick(project: ProjectView): void
}): ReactNode {
  const t = props.t
  const firstRef = useRef<HTMLButtonElement>(null)

  /* 打开即把焦点放到第一行（和菜单一致）；关闭时焦点由上层还给开关。 */
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      id={props.id}
      className='rprj-popover'
      role='dialog'
      aria-label={t('dock.applies')}
    >
      <div className='rprj-popover-head'>
        <span>{t('dock.applies')}</span>
        <button type='button' className='rprj-icon-btn' onClick={props.onClose} aria-label={t('common.close')}>
          ×
        </button>
      </div>
      {props.projects.map((project, index) => (
        <button
          key={project.id}
          ref={index === 0 ? firstRef : undefined}
          type='button'
          className='rprj-popover-row'
          data-missing={project.exists === false}
          title={project.exists === false ? t('panel.missing') : project.path}
          onClick={() => props.onPick(project)}
        >
          <span className='rprj-popover-line'>
            <span className='rprj-popover-name' data-missing={project.exists === false}>{project.name}</span>
            {project.exists === false
              ? <span className='rprj-popover-missing'>{t('panel.missing')}</span>
              : null}
          </span>
          <span className='rprj-popover-path'>{project.path}</span>
          {project.note === '' ? null : <span className='rprj-popover-note'>{project.note}</span>}
        </button>
      ))}
      <div className='rprj-popover-foot'>{t('dock.applies')}</div>
    </div>
  )
}
