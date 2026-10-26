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
  skipped: { name: string; reason: string }[]
}

/** 扫描出来的一个候选技能。 */
export interface ImportCandidate {
  name: string
  files: number
  /** 落点上已经有同名技能（不能导入，只作说明）。 */
  exists: boolean
  flat?: boolean
}

export interface ImportState {
  /** 来源显示名（文件夹名或 ZIP 文件名）。 */
  source: string
  /** 待导入内容（base64）；扫描后才有。 */
  base64: string | null
  candidates: ImportCandidate[]
  /** 包内认不出来的部分。 */
  rejected: { name: string; reason: string }[]
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

  if (state.rejected.length > 0) {
    body.push(h('div', { className: 'dsk-section' },
      h('p', { className: 'dsk-section-title' }, t('import.rejectedTitle')),
      h('pre', { className: 'dsk-pre' }, state.rejected.map((item) => `${item.name} — ${item.reason}`).join('\n'))))
  }

  if (state.result !== null) {
    body.push(h('div', null,
      badgeOf(t('import.done', { imported: state.result.imported.length, skipped: state.result.skipped.length }), 'ok'),
      state.result.skipped.length > 0
        ? h('div', null,
          h('p', { className: 'dsk-section-title' }, t('import.skipped')),
          h('pre', { className: 'dsk-pre' }, state.result.skipped.map((item) => `${item.name} — ${item.reason}`).join('\n')))
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
