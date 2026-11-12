/**
 * 隔离工作区面板（主栏）。
 *
 * 创建不在面板里发生：用户在会话里提出需要，由 AI 调 `worktree_create` 执行。
 * 面板负责两件事——
 *
 *   1. 列出 Host 已有的工作区并映射到 Git 仓库，不另外保存一份仓库清单；
 *   2. 配置创建时使用的分支前缀，并观察 / 清理已经存在的检出。
 *
 * 两条反馈原则：
 *   * 成功与失败**长得不一样**（失败是 `role="alert"` 的红字，不再是灰字）；
 *   * 删除这类不可逆动作把「拿回了什么」（保留的分支、归档引用）说清楚——
 *     这是用户事后唯一能自救的线索。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError, call } from '../core/api.js'
import { refreshStores, useSnapshot } from '../core/store.js'
import { describeError, Spinner } from '../core/ui.js'
import type { DiffValue, RepositoryRow, WorktreeView } from '../core/types.js'
import type { Translate } from '../i18n/index.js'
import { panelStore } from './store.js'
import { WorktreeRow } from './row.js'

export interface PanelProps {
  /** 注册项 `locale` 命名空间带来的译员。 */
  t: Translate
  /**
   * 把界面切到某个会话。外壳没有导航服务时缺省：面板就只回执、不跳转。
   */
  onOpenSession?: (sessionId: string) => void
}

const POLL_MS = 10_000

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

/** 拿到 diff 时记下时间：快照的年龄和内容一样重要。 */
interface DiffEntry {
  value: DiffValue
  at: number
}

interface RemoveReply {
  removed: true
  archivedOid: string | null
  branch: string | null
}

export function Panel(props: PanelProps): ReactNode {
  const t = props.t
  const snapshot = useSnapshot(panelStore)
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [diffs, setDiffs] = useState<Record<string, DiffEntry>>({})
  const [diffLoading, setDiffLoading] = useState<string | null>(null)
  /* 第一次删除被 git 拒绝后，把这一行标记成「允许强制删除」；成功后自动解除。 */
  const [armedForce, setArmedForce] = useState<string | null>(null)

  useEffect(() => {
    void panelStore.refresh(true)
  }, [])

  /*
   * 「允许强制删除」只活 8 秒：跨分钟存活的授权等于没有授权。
   * 用户可能在被拒之后提交并推送了工作，回头再点一次删除时，
   * 那一下必须回到「普通删除」的语义。
   */
  useEffect(() => {
    if (armedForce === null) return undefined
    const timer = setTimeout(() => setArmedForce(null), 8000)
    return () => clearTimeout(timer)
  }, [armedForce])

  /* 目录可以被外部删除、主仓也会前进：可见时轻量轮询，隐藏时不发请求。 */
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void panelStore.refresh(true)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  const data = snapshot.data
  /*
   * 字段缺失时（Host 进程未重载、页面已更新），把差异显式化成一条提示，
   * 而不是让 undefined 在某个表达式里炸掉。
   */
  const hostOutdated = data !== null && typeof data.branchPrefix !== 'string'
  /* 前缀来自 Host 的设置；只在它变化时覆盖输入框。 */
  useEffect(() => {
    if (data !== null) setPrefix(data.branchPrefix ?? '')
  }, [data?.branchPrefix])
  const repository = data?.repository ?? null
  const worktrees = data?.worktrees ?? []
  const repositories = data?.repositories ?? []
  const isolation = data?.isolation ?? null
  const alreadyIsolated = isolation?.inWorktree === true
  /* 目录已丢或 Git 标记为可回收时出现清理入口，避免多一个常驻按钮。 */
  const hasMissing = worktrees.some((view) => view.state === 'missing' || view.prunable)

  const run = async (task: () => Promise<string | null>): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const message = await task()
      if (message !== null) setNotice({ kind: 'ok', text: message })
      await refreshStores()
    } catch (error) {
      setNotice({ kind: 'error', text: describeError(t, error) })
    } finally {
      setBusy(false)
    }
  }

  const select = (path: string): void => {
    if (path === '') return
    void run(async () => {
      await call('select', { repository: path })
      return null
    })
  }

  /* 前缀是「命名策略」，不是创建入口：AI 创建时读它。 */
  const savePrefix = (): void => {
    void run(async () => {
      const result = await call<{ branchPrefix: string }>('settings', { branchPrefix: prefix })
      setPrefix(result.branchPrefix)
      return t('panel.saved')
    })
  }

  const toggleDiff = (view: WorktreeView): void => {
    if (diffs[view.id] !== undefined) {
      setDiffs((prev) => {
        const next = { ...prev }
        delete next[view.id]
        return next
      })
      return
    }
    setDiffLoading(view.id)
    void call<DiffValue>('diff', { id: view.id })
      .then((diff) => setDiffs((prev) => ({ ...prev, [view.id]: { value: diff, at: Date.now() } })))
      .catch((error: unknown) => setNotice({ kind: 'error', text: describeError(t, error) }))
      .finally(() => setDiffLoading(null))
  }

  const apply = (view: WorktreeView): void => {
    void run(async () => {
      const result = await call<{ result: { files: number } }>('apply', { id: view.id })
      setDiffs((prev) => {
        const next = { ...prev }
        delete next[view.id]
        return next
      })
      return t('panel.applied', { n: result.result.files })
    })
  }

  const register = (view: WorktreeView): void => {
    void run(async () => {
      await call('register', { id: view.id })
      return t('panel.registered')
    })
  }

  /* 会话的 cwd 不可变，所以「进入检出」只能是「在检出里新开一个会话」；
   * 建完就跳过去——留在原地的话用户拿到的是一个还得自己去侧栏找的 id。 */
  const newSession = (view: WorktreeView): void => {
    void run(async () => {
      const result = await call<{ sessionId: string | null }>('session', { id: view.id })
      if (result.sessionId === null) return t('panel.sessionUnavailable')
      props.onOpenSession?.(result.sessionId)
      return t('panel.sessionCreated', { name: view.name, id: result.sessionId.slice(0, 8) })
    })
  }

  const openFolder = (view: WorktreeView): void => {
    void run(async () => {
      const result = await call<{ opened: boolean }>('open', { id: view.id })
      return result.opened ? null : t('panel.openFailed')
    })
  }

  /**
   * 删除先不带 force：让 Host 检查未提交改动与「只有这里知道」的提交。
   * 被拒绝时把这一行解锁一次，用户再确认就真的强制删除。
   * 成功后的回执必须带上「拿回了什么」，否则归档引用等于没留。
   */
  const remove = (view: WorktreeView): void => {
    const force = armedForce === view.id
    setBusy(true)
    setNotice(null)
    void (async () => {
      try {
        const result = await call<RemoveReply>('remove', { id: view.id, force })
        setArmedForce(null)
        const parts = [t('panel.removed')]
        if (result.branch !== null) parts.push(t('panel.removedBranch', { branch: result.branch }))
        if (result.archivedOid !== null) {
          const oid = result.archivedOid.slice(0, 7)
          parts.push(t('panel.removedArchived', { ref: 'refs/dsh/archive/' + view.id, oid }))
        }
        setNotice({ kind: 'ok', text: parts.join(' ') })
        await refreshStores()
      } catch (error) {
        if (error instanceof ApiError && (
          error.code === 'worktree-dirty'
          || error.code === 'worktree-unmerged'
          || error.code === 'worktree-unpushed'
        )) {
          setArmedForce(view.id)
          setNotice({ kind: 'error', text: t('panel.forceHint') })
        } else {
          setNotice({ kind: 'error', text: describeError(t, error) })
        }
      } finally {
        setBusy(false)
      }
    })()
  }

  const prune = (): void => {
    void run(async () => {
      const result = await call<{ removed?: number; pruned?: string[] }>('prune')
      const total = (result.removed ?? 0) + (result.pruned?.length ?? 0)
      return total === 0 ? t('panel.noPrune') : t('panel.pruned', { n: total })
    })
  }

  if (snapshot.status === 'error' && data === null) {
    return (
      <div className='wt-panel'>
        <div className='wt-error' role='alert'>{describeError(t, snapshot.error)}</div>
      </div>
    )
  }
  if (data === null) {
    return (
      <div className='wt-panel'>
        <div className='wt-muted' role='status'><Spinner /> {t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className='wt-panel' role='region' aria-label={t('panel.title')} aria-busy={busy}>
      <header className='wt-panel-head'>
        <h2 className='wt-title'>{t('panel.title')}</h2>
        <p className='wt-sub'>{t('panel.description')}</p>
      </header>

      {hostOutdated
        ? <div className='wt-notice' role='status'>{t('panel.hostOutdated')}</div>
        : null}

      {alreadyIsolated && isolation !== null
        ? (
          <div className='wt-isolation' role='status'>
            <strong>{t('panel.isolation', { path: isolation.path ?? isolation.cwd ?? '' })}</strong>
            <span className='wt-muted'>
              {isolation.branch === null ? t('panel.isolationDetached') : t('panel.isolationBranch', { branch: isolation.branch })}
            </span>
            <span className='wt-muted'>{t('panel.isolationHint')}</span>
          </div>
        )
        : null}

      <div className='wt-bar'>
        <label className='wt-muted' htmlFor='wt-repository'>{t('panel.repository')}</label>
        <select
          id='wt-repository'
          className='wt-select'
          value={repository?.root ?? ''}
          disabled={busy}
          onChange={(event) => select(event.target.value)}
        >
          {repository === null ? <option value=''>{t('panel.chooseRepository')}</option> : null}
          {repositories.map((row: RepositoryRow) => (
            <option key={row.root} value={row.root}>
              {row.worktrees > 0 ? `${row.name}（${row.worktrees}）` : row.name}
            </option>
          ))}
        </select>
        <span className='wt-grow' />
        <span className='wt-muted'>{data.layout === 'repo' ? t('panel.layoutRepo') : t('panel.layoutState')}</span>
        {hasMissing
          ? (
            <button type='button' className='wt-btn wt-btn-quiet' disabled={busy} onClick={prune}>
              {t('panel.prune')}
            </button>
          )
          : null}
        <button type='button' className='wt-btn' disabled={busy} onClick={() => { void panelStore.refresh(true) }}>
          {t('common.refresh')}
        </button>
      </div>

      {repository !== null
        ? (
          <form
            className='wt-bar'
            onSubmit={(event) => {
              /* 原生表单提交同时接管 Enter：只在这里处理一次提交。 */
              event.preventDefault()
              savePrefix()
            }}
          >
            <label className='wt-muted' htmlFor='wt-prefix'>{t('panel.prefix')}</label>
            <input
              id='wt-prefix'
              className='wt-input wt-input-name'
              name='worktree-prefix'
              value={prefix}
              disabled={busy}
              autoComplete='off'
              spellCheck={false}
              placeholder={t('panel.prefixPlaceholder')}
              onChange={(event) => setPrefix(event.target.value)}
            />
            <button
              type='submit'
              className='wt-btn wt-btn-primary'
              disabled={busy || hostOutdated || prefix.trim() === (data.branchPrefix ?? '')}
            >
              {busy ? <Spinner /> : null} {t('panel.save')}
            </button>
            <span className='wt-muted'>{t('panel.prefixHint')}</span>
          </form>
        )
        : null}

      {notice !== null
        ? (
          <div
            className={notice.kind === 'error' ? 'wt-error' : 'wt-notice'}
            role={notice.kind === 'error' ? 'alert' : 'status'}
            aria-live='polite'
          >
            {notice.text}
          </div>
        )
        : null}

      {repository === null
        ? (
          <div className='wt-empty'>
            <p>{t('panel.noRepository')}</p>
            <p className='wt-empty-hint'>{t('panel.noRepositoryHint')}</p>
          </div>
        )
        : worktrees.length === 0
          ? (
            <div className='wt-empty'>
              <p>{t('panel.empty')}</p>
              <p className='wt-empty-hint'>{t('panel.emptyHint')}</p>
            </div>
          )
          : (
            <div className='wt-rows'>
              {worktrees.map((view: WorktreeView) => {
                const entry = diffs[view.id]
                const age = entry === undefined ? 0 : Date.now() - entry.at
                return (
                  <WorktreeRow
                    key={view.id}
                    t={t}
                    view={view}
                    busy={busy}
                    diff={entry?.value ?? null}
                    diffAge={age === 0 ? 0 : Math.max(1, Math.round(age / 1000))}
                    diffStale={age >= POLL_MS}
                    diffLoading={diffLoading === view.id}
                    forceArmed={armedForce === view.id}
                    onToggleDiff={() => toggleDiff(view)}
                    onOpen={() => openFolder(view)}
                    onRegister={() => register(view)}
                    onSession={() => newSession(view)}
                    onApply={() => apply(view)}
                    onRemove={() => remove(view)}
                  />
                )
              })}
            </div>
          )}
    </div>
  )
}
