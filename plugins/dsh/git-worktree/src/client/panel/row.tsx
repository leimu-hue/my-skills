/**
 * 一行 = 一个检出。
 *
 * 行内只放「现在是什么状态」与「可以做什么」；diff 展开在同一行下方，
 * 不弹窗——用户核对改动时不该同时丢掉列表上下文。
 *
 * 外部创建的检出（`origin === 'external'`）只有「打开目录」：插件没有它的
 * 创建基线，也不该替 Git 删除别人的工作。
 *
 * 两个「别让人猜」的细节：
 *   * diff 带上它被取到的时刻（`diffAge`）——列表会轮询刷新，diff 不会；
 *   * 强制删除是一颗**不同的按钮**，文案也不同——同名按钮换个后果是最容易误点的地方。
 */
import type { ReactNode } from 'react'
import type { DiffValue, WorktreeView } from '../core/types.js'
import { ConfirmButton } from '../core/ui.js'
import type { Translate } from '../i18n/index.js'

export interface WorktreeRowProps {
  t: Translate
  view: WorktreeView
  busy: boolean
  diff: DiffValue | null
  /** diff 是几秒前取的；0 表示没有展开。 */
  diffAge: number
  /** diff 比轮询间隔还旧：列表已经刷新过，它可能不再代表现状。 */
  diffStale: boolean
  diffLoading: boolean
  forceArmed: boolean
  onToggleDiff(): void
  onOpen(): void
  onRegister(): void
  onSession(): void
  onApply(): void
  onRemove(): void
}

/** 每个文件一行 `path +A/-D`；二进制文件是 `-`，显示成 `·`。 */
function summarizeFiles(diff: DiffValue, t: Translate): ReactNode {
  if (diff.files.length === 0) return null
  const shown = diff.files.slice(0, 8).map((file) => {
    const added = file.added === null ? '·' : `+${file.added}`
    const removed = file.removed === null ? '·' : `-${file.removed}`
    return `${file.path} ${added}/${removed}`
  })
  return (
    <p className='wt-diff-note'>
      {t('panel.diffSummary', { n: diff.files.length })}：{shown.join('，')}
    </p>
  )
}

export function WorktreeRow(props: WorktreeRowProps): ReactNode {
  const t = props.t
  const view = props.view
  const missing = view.state === 'missing'
  const managed = view.origin === 'managed'
  const expandable = managed && !missing
  const hasWork = view.dirty + view.ahead > 0

  return (
    <div className='wt-row' data-external={!managed}>
      <div className='wt-row-head'>
        <span className='wt-name' title={view.path}>{view.name}</span>
        <span className='wt-badges'>
          {view.current ? <span className='wt-badge wt-badge-current'>{t('panel.current')}</span> : null}
          {view.branch === null
            ? <span className='wt-badge'>{t('panel.detached')}</span>
            : <span className='wt-badge wt-badge-branch'>{t('panel.branch', { branch: view.branch })}</span>}
          {!managed ? <span className='wt-badge wt-badge-external'>{t('panel.external')}</span> : null}
          {missing ? <span className='wt-badge wt-badge-missing'>{t('panel.missing')}</span> : null}
          {view.dirty > 0 ? <span className='wt-badge wt-badge-dirty'>{t('panel.dirty', { n: view.dirty })}</span> : null}
          {view.files > 0 ? <span className='wt-badge'>{t('panel.files', { n: view.files })}</span> : null}
          {view.ahead > 0 ? <span className='wt-badge'>{t('panel.ahead', { n: view.ahead })}</span> : null}
          {view.behind > 0 ? <span className='wt-badge'>{t('panel.behind', { n: view.behind })}</span> : null}
        </span>
        <span className='wt-grow' />
        <span className='wt-actions'>
          <button type='button' className='wt-btn wt-btn-quiet' disabled={props.busy || missing} onClick={props.onOpen}>
            {t('panel.openDir')}
          </button>
          {managed
            ? (
              <button type='button' className='wt-btn wt-btn-quiet' disabled={props.busy || missing} onClick={props.onRegister}>
                {view.workspaceId === null ? t('panel.register') : t('panel.registered')}
              </button>
            )
            : null}
          {managed && view.workspaceId !== null
            ? (
              <button type='button' className='wt-btn wt-btn-quiet' disabled={props.busy || missing} onClick={props.onSession}>
                {t('panel.newSession')}
              </button>
            )
            : null}
          {expandable
            ? (
              <button type='button' className='wt-btn' disabled={props.busy || props.diffLoading} onClick={props.onToggleDiff}>
                {props.diff === null ? t('panel.viewDiff') : t('panel.hideDiff')}
              </button>
            )
            : null}
          {managed
            ? (
              <button
                type='button'
                className='wt-btn wt-btn-primary'
                disabled={props.busy || missing || !hasWork}
                onClick={props.onApply}
              >
                {t('panel.apply')}
              </button>
            )
            : null}
          {managed
            ? (
              <ConfirmButton
                title={props.forceArmed ? t('panel.removeForce') : t('panel.remove')}
                confirmText={props.forceArmed ? t('panel.removeForceConfirm') : t('panel.removeConfirm')}
                confirmLabel={props.forceArmed ? t('panel.removeForce') : t('panel.remove')}
                cancelLabel={t('common.cancel')}
                onConfirm={props.onRemove}
              >
                {props.forceArmed ? t('panel.removeForce') : t('panel.remove')}
              </ConfirmButton>
            )
            : null}
        </span>
      </div>
      <div className='wt-path'>{view.path}</div>
      {!managed ? <p className='wt-diff-note'>{t('panel.externalHint')}</p> : null}
      {props.diff !== null
        ? (
          <div className='wt-row-diff'>
            {summarizeFiles(props.diff, t)}
            {props.diff.patch === ''
              ? <p className='wt-diff-note'>{t('panel.noChanges')}</p>
              : <pre className='wt-diff'>{props.diff.patch}</pre>}
            {props.diff.untracked.length > 0
              ? <p className='wt-diff-note'>{t('panel.untracked', { paths: props.diff.untracked.join(', ') })}</p>
              : null}
            {props.diff.truncated ? <p className='wt-diff-note'>{t('panel.truncated')}</p> : null}
            {props.diffStale ? <p className='wt-diff-note'>{t('panel.diffStale')}</p> : null}
            {props.diffAge > 0 ? <p className='wt-diff-note'>{t('panel.diffAge', { n: props.diffAge })}</p> : null}
          </div>
        )
        : null}
    </div>
  )
}
