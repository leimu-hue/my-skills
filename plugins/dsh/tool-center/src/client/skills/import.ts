/**
 * 导入面板：选一个技能文件夹 / ZIP → 扫描出候选 → 勾选 → 只导入选中的那些。
 *
 * 两个刻意的决定：
 *   * **先看再导**：压缩包先交给 host 的 `import-scan`（只读，不写盘），把里面有哪些技能、
 *     哪些已经存在列出来，用户勾完再 `import-zip`。一次全导是以前的行为，容易塞进一堆
 *     不想要的东西；
 *   * **不给手填路径**：既然已经能选文件夹，再摆一个「本机路径」输入框只是多一条出错的路。
 *
 * 为什么选文件夹要绕一圈：浏览器只能拿到 `File` 对象，拿不到磁盘真实路径（Electron 不再向
 * 渲染进程暴露 `File.path`），所以选中的文件在前端打成 ZIP 再上传（见 core/zip.ts）。
 */
import { h } from '../core/runtime.js'
import type { Translate } from '../i18n/index.js'
import type { RootView } from '../core/types.js'
import { alertOf, badgeOf, buttonOf, fieldOf, modalOf, mutedOf } from '../core/ui.js'

export interface ImportOutcome {
  imported: { name: string; files: number }[]
  /** 跳过的条目；`code` 有值时按它取词条，否则直接用 `reason`。 */
  skipped: { name: string; reason: string; code?: string }[]
  /** 已知与技能无关、被直接忽略的文件数。 */
  ignored?: number
}

/** 扫描出来的一个候选技能。 */
export interface ImportCandidate {
  name: string
  files: number
  /** 落点上已经有同名技能（不能导入，只作说明）。 */
  exists: boolean
  flat?: boolean
}

/** 一条文件级诊断（Host 的 `FileNote` 镜像）：一个进不了技能目录的文件 + 为什么。 */
export interface FileNote {
  path: string
  /** 原因码，取 `import.reason.*` 词条；取不到就用 `reason`。 */
  code?: string
  reason: string
}

export interface ImportState {
  /** 来源显示名（文件夹名或 ZIP 文件名）。 */
  source: string
  /** 待导入内容（base64）；扫描后才有。 */
  base64: string | null
  candidates: ImportCandidate[]
  /** 技能级问题（名字不合法、同名……）。 */
  rejected: { name: string; reason: string }[]
  /** 文件级问题：一条文件一行。 */
  orphans: FileNote[]
  /** 与技能无关、被直接忽略的文件。 */
  ignored: FileNote[]
  /** 勾选的技能名。 */
  picked: string[]
  result: ImportOutcome | null
}

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

/** 目录选择需要 `webkitdirectory`；不支持时把它藏起来，别给一个按了没反应的按钮。 */
function supportsFolderPick(): boolean {
  return typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input')
}

/**
 * 文件选择控件的通用属性：真正的控件藏在按钮下面。
 *
 * ⚠️ 顺序很关键：`FileList` 是**活的**，把 `input.value` 清空会让它同时变空。所以必须
 * 先把 `files` 拍成数组，再清 value —— 反过来写会静默拿到空列表（症状就是「选完没反应」）。
 */
function pickerProps(busy: boolean, onPicked: (files: File[]) => void): Record<string, unknown> {
  return {
    type: 'file',
    disabled: busy,
    style: { display: 'none' },
    onChange: (event: { target: { files?: FileList | null; value: string } }) => {
      const input = event.target
      const picked = Array.from(input.files ?? [])
      input.value = ''
      if (picked.length > 0) onPicked(picked)
    },
  }
}

/** 一条诊断的句子：先按原因码查词典，词条不存在就用宿主给的兜底句子。 */
function reasonOf(t: Translate, note: FileNote): string {
  if (note.code === undefined) return note.reason
  const key = `import.reason.${note.code}`
  const translated = t(key)
  return translated === key ? note.reason : translated
}

/** 「文件 — 原因」列表：一个文件一行（路径等宽、原因右对齐）。 */
function failsOf(rows: { path: string; reason: string }[], keyPrefix: string): unknown {
  return h('div', { className: 'dsk-fails' }, rows.map((row) => h('div', {
    className: 'dsk-fail',
    key: `${keyPrefix}:${row.path}`,
  },
  h('span', { className: 'dsk-fail-path', title: row.path }, row.path),
  h('span', { className: 'dsk-fail-reason' }, row.reason))))
}

/**
 * 与技能无关、被直接忽略的文件（系统垃圾、bundle 级说明与清单）。
 *
 * 折叠着只报个数 —— 它们不打扰人，但也不能真的消失：点开就是全部路径。
 */
function ignoredOf(t: Translate, notes: FileNote[]): unknown {
  return h('details', { className: 'dsk-fails-more' },
    h('summary', null, `${t('import.ignored', { n: notes.length })} · ${t('import.ignoredHint')}`),
    failsOf(notes.map((note) => ({ path: note.path, reason: reasonOf(t, note) })), 'ignored'))
}

export function renderImport(t: Translate, props: ImportHandlers): unknown {
  const state = props.state
  const busy = props.busy !== ''
  const missingTarget = props.target === undefined
  const importable = state.candidates.filter((candidate) => !candidate.exists)
  const pickedCount = state.picked.filter((name) => importable.some((candidate) => candidate.name === name)).length
  const body: unknown[] = []

  if (missingTarget) body.push(alertOf(t('import.needTarget')))
  else body.push(mutedOf(`${t('import.root')}：${props.target?.label ?? ''}`))

  body.push(fieldOf(t('import.pickTitle'), h('div', { className: 'dsk-actions' },
    supportsFolderPick()
      ? h('label', { className: 'dsk-btn dsk-btn-primary dsk-pick' },
        busy ? t('import.scanning') : t('import.pickFolder'),
        h('input', {
          ...pickerProps(busy, props.onPickFolder),
          // 非标准属性，Chromium 支持（桌面版宿主就是 Chromium）。
          webkitdirectory: '',
          directory: '',
          multiple: true,
        }))
      : null,
    h('label', { className: 'dsk-btn dsk-pick' },
      t('import.pickZip'),
      h('input', {
        ...pickerProps(busy, (picked) => {
          const file = picked[0]
          if (file !== undefined) props.onPickZip(file)
        }),
        accept: '.zip',
      })))))

  if (state.candidates.length > 0) {
    body.push(h('div', { className: 'dsk-section' },
      h('p', { className: 'dsk-section-title' },
        `${t('import.candidates', { n: state.candidates.length })} · ${t('import.source', { name: state.source })}`),
      h('div', { className: 'dsk-toolbar' },
        buttonOf({ label: t('import.selectAll'), small: true, disabled: busy, onClick: () => props.onToggleAll(true) }),
        buttonOf({ label: t('import.selectNone'), small: true, disabled: busy, onClick: () => props.onToggleAll(false) }),
        mutedOf(t('import.selected', { n: pickedCount, total: importable.length }))),
      h('div', { className: 'dsk-candidates' }, state.candidates.map((candidate) => {
        const checked = state.picked.includes(candidate.name) && !candidate.exists
        return h('label', {
          className: 'dsk-check dsk-candidate',
          key: candidate.name,
          'data-disabled': String(candidate.exists),
        },
        h('input', {
          type: 'checkbox',
          checked,
          disabled: busy || candidate.exists,
          onChange: () => props.onToggle(candidate.name),
        }),
        h('span', { className: 'dsk-candidate-name' }, candidate.name),
        mutedOf(candidate.flat === true ? '.md' : t('import.fileCount', { n: candidate.files })),
        candidate.exists ? badgeOf(t('import.exists'), 'off') : null)
      }))))
  }

  if (state.rejected.length > 0 || state.orphans.length > 0) {
    /* 一个文件一行「文件 — 原因」：早先这些是全塞进一个 `<pre>` 的一句聚合话
       （「3 个文件不在任何技能目录下」+ 逗号拼接），既看不出是哪个文件，也看不出为什么。 */
    const problems = [
      ...state.rejected.map((item) => ({ path: item.name, reason: item.reason })),
      ...state.orphans.map((note) => ({ path: note.path, reason: reasonOf(t, note) })),
    ]
    body.push(h('div', { className: 'dsk-section' },
      h('p', { className: 'dsk-section-title' },
        `${t('import.rejectedTitle')} · ${t('import.fileCount', { n: problems.length })}`),
      failsOf(problems, 'problem'),
      state.ignored.length > 0 ? ignoredOf(t, state.ignored) : null))
  } else if (state.ignored.length > 0) {
    body.push(ignoredOf(t, state.ignored))
  }

  if (state.result !== null) {
    body.push(h('div', { className: 'dsk-section' },
      badgeOf(t('import.done', { imported: state.result.imported.length, skipped: state.result.skipped.length }), 'ok'),
      (state.result.ignored ?? 0) > 0
        ? mutedOf(t('import.ignored', { n: state.result.ignored ?? 0 }))
        : null,
      state.result.skipped.length > 0
        ? h('div', null,
          h('p', { className: 'dsk-section-title' }, t('import.skipped')),
          failsOf(state.result.skipped.map((item) => ({
            path: item.name,
            reason: reasonOf(t, { path: item.name, code: item.code, reason: item.reason }),
          })), 'skipped'))
        : null))
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
