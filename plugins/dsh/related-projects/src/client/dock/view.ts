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
 */
import { h, useReact } from '../core/runtime.js'
import { call, sessionPayload } from '../core/api.js'
import { insertMention, type InputActions } from '../core/reference.js'
import { describeError } from '../core/ui.js'
import { useSnapshot, type Store } from '../core/store.js'
import { withFallback, type Translate } from '../i18n/index.js'
import type { ProjectView } from '../core/types.js'

export interface DockProps {
  sessionId?: string
  inputActions?: InputActions
  /** 由注册项的 `locale` 命名空间提供。 */
  t: Translate
  /** 插件自己的词典，在席位返回原始键名时使用。 */
  fallbackT?: Translate
  /** 在注册项的 `inject` 环境里创建的按会话存储。 */
  dockStore: Store
  /** Client 会话目录中该会话对应的目录，未知时为 ''。 */
  workspaceHint(sessionId: unknown): string
}

export function DockRow(props: DockProps): unknown {
  const React = useReact()
  /* 先问席位（它跟随语言包），再问打进来的词典：
     命名空间缺失时，绝不能让用户看到 `dock.label`。 */
  const t = withFallback(props.t, props.fallbackT ?? props.t)
  const sessionId = props.sessionId
  const store = props.dockStore
  const snapshot = useSnapshot(store)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    void store.refresh()
  }, [store])

  /* 在 Host 还在启动时（或插件刚重载后）取到的快照，
     可能报「没有工作区」；要让它保持新鲜，而不是拿
     一个早期答案用满整个页面生命周期。回到应用也算一次：
     Host 可能已经在页面隐藏期间把会话恢复完了。 */
  React.useEffect(() => {
    const refreshNow = (): void => {
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
  React.useEffect(() => {
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
      if (event.key === 'Escape') setOpen(false)
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
      const picked = await call<{ path?: string }>('pick', {})
      const path = picked.path ?? ''
      if (path === '') return
      /* 传会话 id，而不是 Client 自己猜：工作区由 Host 解析。
         Client 目录的线索一并带上，因为老会话的恢复可能还在途——
         不带它，这次添加会被判成「workspace-missing」而拒绝。 */
      await call('add', sessionPayload(String(sessionId ?? ''), props.workspaceHint, { path, notify: true }))
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

/** 只读列表，每个项目一行：点一行即插入它的路径。 */
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
        'aria-label': t('common.cancel'),
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
