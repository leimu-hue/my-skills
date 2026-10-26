/** 导入面板：按路径导入，或上传一个 ZIP。 */
import { h } from '../core/runtime.js'
import type { Translate } from '../i18n/index.js'
import type { RootView } from '../core/types.js'
import { alertOf, badgeOf, buttonOf, fieldOf, inputOf, modalOf, selectOf } from '../core/ui.js'

export interface ImportOutcome {
  imported: { name: string; files: number }[]
  skipped: { name: string; reason: string }[]
}

export interface ImportState {
  root: string
  path: string
  result: ImportOutcome | null
}

export interface ImportHandlers {
  state: ImportState
  roots: RootView[]
  busy: string
  onChange(patch: Partial<ImportState>): void
  onClose(): void
  onImportPath(): void
  onImportZip(file: File): void
}

export function renderImport(t: Translate, props: ImportHandlers): unknown {
  const state = props.state
  const body: unknown[] = []

  if (props.roots.length === 0) {
    body.push(alertOf(t('import.needTarget')))
  } else {
    body.push(
      fieldOf(t('import.root'), selectOf({
        value: state.root,
        onChange: (root) => props.onChange({ root }),
        options: props.roots.map((root) => ({ value: root.key, label: root.label })),
      })),
      fieldOf(t('import.pathLabel'), h('div', { className: 'dsk-toolbar' },
        inputOf({
          value: state.path,
          placeholder: t('import.pathPlaceholder'),
          onChange: (path) => props.onChange({ path }),
        }),
        buttonOf({ label: t('import.byPath'), disabled: props.busy !== '', onClick: props.onImportPath }))),
      fieldOf(t('import.byZip'), h('input', {
        className: 'dsk-input',
        type: 'file',
        accept: '.zip',
        onChange: (event: { target: { files?: FileList | null } }) => {
          const file = event.target.files?.[0]
          if (file !== undefined) props.onImportZip(file)
        },
      })),
    )
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

  return modalOf(t('import.title'), body, [
    buttonOf({ label: t('import.close'), onClick: props.onClose }),
  ])
}
