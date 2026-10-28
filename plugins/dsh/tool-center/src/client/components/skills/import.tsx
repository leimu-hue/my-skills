/**
 * 导入面板：选一个技能文件夹 / ZIP → 扫描出候选 → 勾选 → 只导入选中的那些。
 *
 * 两个刻意的决定：
 *   * **先看再导**：压缩包先交给 host 的 `import-scan`（只读，不写盘），把里面有哪些技能、
 *     哪些已经存在列出来，用户勾完再 `import-zip`。一次全导是以前的行为，容易塞进一堆
 *     不想要的东西；
 *   * **不给手填路径**：既然已经能选文件夹，再摆一个「本机路径」输入框只是多一条出错的路。
 *
 * 选文件夹要绕一圈打 ZIP 的原因见 `lib/files.ts`。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import { folderPickSupported, takeFiles, type PickEvent } from '../../lib/skills/files.ts'
import type { FileNote, ImportState, RootView } from '../../lib/core/types.ts'
import { alertOf, badgeOf, mutedOf } from '../ui/atoms.tsx'
import { buttonOf, fieldOf, modalOf } from '../ui/controls.tsx'

export interface ImportHandlers {
  state: ImportState
  /** 导入落点（固定「导入技能」，选择器已去掉）。 */
  target: RootView | undefined
  busy: string
  onClose(): void
  onPickFolder(files: File[]): void
  onPickZip(file: File): void
  onToggle(name: string): void
  onToggleAll(selected: boolean): void
  onConfirm(): void
}

/** 一条诊断的句子：先按原因码查词典，词条不存在就用宿主给的兜底句子。 */
function reasonOf(t: Translate, note: FileNote): string {
  if (note.code === undefined) return note.reason
  const key = `import.reason.${note.code}`
  const translated = t(key)
  return translated === key ? note.reason : translated
}

/** 「文件 — 原因」列表：一个文件一行（路径等宽、原因右对齐）。 */
function failsOf(rows: { path: string; reason: string }[], keyPrefix: string): ReactNode {
  return (
    <div className='dsk-fails'>
      {rows.map((row) => (
        <div className='dsk-fail' key={`${keyPrefix}:${row.path}`}>
          <span className='dsk-fail-path' title={row.path}>{row.path}</span>
          <span className='dsk-fail-reason'>{row.reason}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 与技能无关、被直接忽略的文件（系统垃圾、bundle 级说明与清单）。
 *
 * 折叠着只报个数 —— 它们不打扰人，但也不能真的消失：点开就是全部路径。
 */
function ignoredOf(t: Translate, notes: FileNote[]): ReactNode {
  return (
    <details className='dsk-fails-more'>
      <summary>{`${t('import.ignored', { n: notes.length })} · ${t('import.ignoredHint')}`}</summary>
      {failsOf(notes.map((note) => ({ path: note.path, reason: reasonOf(t, note) })), 'ignored')}
    </details>
  )
}

export function renderImport(t: Translate, props: ImportHandlers): ReactNode {
  const state = props.state
  const busy = props.busy !== ''
  const missingTarget = props.target === undefined
  const importable = state.candidates.filter((candidate) => !candidate.exists)
  const pickedCount = state.picked.filter((name) => importable.some((candidate) => candidate.name === name)).length
  const body: ReactNode[] = []

  body.push(missingTarget ? alertOf(t('import.needTarget')) : mutedOf(`${t('import.root')}：${props.target?.label ?? ''}`))

  body.push(fieldOf(t('import.pickTitle'), (
    <div className='dsk-actions'>
      {folderPickSupported()
        ? (
          <label className='dsk-btn dsk-btn-primary dsk-pick'>
            {busy ? t('import.scanning') : t('import.pickFolder')}
            <input
              type='file'
              className='dsk-file-input'
              disabled={busy}
              onChange={(event: PickEvent) => {
                const files = takeFiles(event)
                if (files.length > 0) props.onPickFolder(files)
              }}
              // 非标准属性，Chromium 支持（桌面版宿主就是 Chromium）。
              {...{ webkitdirectory: '', directory: '', multiple: true }}
            />
          </label>
        )
        : null}
      <label className='dsk-btn dsk-pick'>
        {t('import.pickZip')}
        <input
          type='file'
          accept='.zip'
          className='dsk-file-input'
          disabled={busy}
          onChange={(event: PickEvent) => {
            const files = takeFiles(event)
            const file = files[0]
            if (file !== undefined) props.onPickZip(file)
          }}
        />
      </label>
    </div>
  )))

  if (state.candidates.length > 0) {
    body.push(
      <div className='dsk-section'>
        <p className='dsk-section-title'>
          {`${t('import.candidates', { n: state.candidates.length })} · ${t('import.source', { name: state.source })}`}
        </p>
        <div className='dsk-toolbar'>
          {buttonOf({ label: t('import.selectAll'), small: true, disabled: busy, onClick: () => props.onToggleAll(true) })}
          {buttonOf({ label: t('import.selectNone'), small: true, disabled: busy, onClick: () => props.onToggleAll(false) })}
          {mutedOf(t('import.selected', { n: pickedCount, total: importable.length }))}
        </div>
        <div className='dsk-candidates'>
          {state.candidates.map((candidate) => {
            const checked = state.picked.includes(candidate.name) && !candidate.exists
            return (
              <label
                className='dsk-check dsk-candidate'
                key={candidate.name}
                data-disabled={String(candidate.exists)}
              >
                <input
                  type='checkbox'
                  checked={checked}
                  disabled={busy || candidate.exists}
                  onChange={() => props.onToggle(candidate.name)}
                />
                <span className='dsk-candidate-name'>{candidate.name}</span>
                {mutedOf(candidate.flat === true ? '.md' : t('import.fileCount', { n: candidate.files }))}
                {candidate.exists ? badgeOf(t('import.exists'), 'off') : null}
              </label>
            )
          })}
        </div>
      </div>,
    )
  }

  if (state.rejected.length > 0 || state.orphans.length > 0) {
    /* 一个文件一行「文件 — 原因」：早先这些是全塞进一个 `<pre>` 的一句聚合话
       （「3 个文件不在任何技能目录下」+ 逗号拼接），既看不出是哪个文件，也看不出为什么。 */
    const problems = [
      ...state.rejected.map((item) => ({ path: item.name, reason: item.reason })),
      ...state.orphans.map((note) => ({ path: note.path, reason: reasonOf(t, note) })),
    ]
    body.push(
      <div className='dsk-section'>
        <p className='dsk-section-title'>
          {`${t('import.rejectedTitle')} · ${t('import.fileCount', { n: problems.length })}`}
        </p>
        {failsOf(problems, 'problem')}
        {state.ignored.length > 0 ? ignoredOf(t, state.ignored) : null}
      </div>,
    )
  } else if (state.ignored.length > 0) {
    body.push(ignoredOf(t, state.ignored))
  }

  if (state.result !== null) {
    body.push(
      <div className='dsk-section'>
        {badgeOf(t('import.done', { imported: state.result.imported.length, skipped: state.result.skipped.length }), 'ok')}
        {(state.result.ignored ?? 0) > 0 ? mutedOf(t('import.ignored', { n: state.result.ignored ?? 0 })) : null}
        {state.result.skipped.length > 0
          ? (
            <div>
              <p className='dsk-section-title'>{t('import.skipped')}</p>
              {failsOf(state.result.skipped.map((item) => ({
                path: item.name,
                reason: reasonOf(t, { path: item.name, code: item.code, reason: item.reason }),
              })), 'skipped')}
            </div>
          )
          : null}
      </div>,
    )
  }

  const canConfirm = !missingTarget && !busy && state.base64 !== null && state.result === null
  return modalOf(t('import.title'), body, [
    canConfirm
      ? buttonOf({
        label: t('import.confirm', { n: pickedCount }),
        variant: 'primary',
        disabled: pickedCount === 0,
        onClick: props.onConfirm,
      })
      : null,
    buttonOf({ label: t('import.close'), onClick: props.onClose }),
  ])
}
