/**
 * 技能详情：右侧抽屉 + 遮罩。
 *
 * 两个刻意的细节：
 *   * **有遮罩**：抽屉不会把左侧列表压掉一块，也不会显得像「飘在窗口右边的一条」；
 *   * **点遮罩就关**：抽屉之外的任何位置（以及 Esc，见 `view.ts`）都能关掉它，
 *     不必先去找头部那个关闭按钮。
 */
import { h } from '../core/runtime.js'
import type { Translate } from '../i18n/index.js'
import type { SkillDetail } from '../core/types.js'
import { alertOf, buttonOf, emptyOf } from '../core/ui.js'

export interface DetailHandlers {
  selected: { root: string; name: string }
  detail: SkillDetail | null
  busy: string
  onClose(): void
  onEdit(): void
  onDelete(): void
  onExport(): void
  onPrefer(preferred: boolean): void
}

type ClickEvent = { stopPropagation(): void }

export function renderDetail(t: Translate, props: DetailHandlers): unknown {
  const row = props.detail?.row
  const disabled = props.busy !== ''
  const action = (label: string, onClick: () => void, danger = false): unknown => buttonOf({
    label,
    small: true,
    disabled,
    variant: danger ? 'danger' : undefined,
    onClick,
  })

  return h('div', { className: 'dsk-panel-mask', onClick: props.onClose },
    h('div', {
      className: 'dsk-panel',
      role: 'dialog',
      'aria-modal': 'true',
      onClick: (event: ClickEvent) => event.stopPropagation(),
    },
    h('div', { className: 'dsk-panel-head' },
      h('div', { className: 'dsk-panel-title-row' },
        h('h4', { className: 'dsk-panel-title' }, row?.declaredName ?? props.selected.name),
        buttonOf({ label: t('detail.close'), small: true, onClick: props.onClose })),
      h('div', { className: 'dsk-panel-actions' },
        row !== undefined && row.rootWritable ? action(t('detail.edit'), props.onEdit) : null,
        row !== undefined
          ? action(row.preferred ? t('detail.unprefer') : t('detail.prefer'), () => props.onPrefer(row.preferred !== true))
          : null,
        row !== undefined ? action(t('detail.export'), props.onExport) : null,
        row !== undefined && row.rootWritable ? action(t('detail.delete'), props.onDelete, true) : null)),
    h('div', { className: 'dsk-panel-body' },
      ...(props.detail === null ? [emptyOf(t('detail.busy'))] : bodyOf(t, props.detail)))))
}

/** 详情正文的各个段落（顺序与阅读顺序一致）。 */
function bodyOf(t: Translate, detail: SkillDetail): unknown[] {
  const row = detail.row
  return [
    h('div', { className: 'dsk-kv' },
      h('span', { className: 'dsk-kv-key' }, t('detail.path')),
      h('span', { className: 'dsk-kv-val' }, row.docPath),
      h('span', { className: 'dsk-kv-key' }, 'root'),
      h('span', { className: 'dsk-kv-val' }, `${row.rootKey} · rank ${row.rootRank}`)),
    row.problem === undefined ? null : alertOf(`${t('detail.problem')}：${row.problem}`),
    row.whenToUse === undefined
      ? null
      : h('div', null,
        h('p', { className: 'dsk-section-title' }, 'whenToUse'),
        h('div', { className: 'dsk-row-desc' }, row.whenToUse)),
    h('div', null,
      h('p', { className: 'dsk-section-title' }, t('detail.frontmatter')),
      h('pre', { className: 'dsk-pre' }, JSON.stringify(detail.frontmatter, null, 2))),
    h('div', null,
      h('p', { className: 'dsk-section-title' }, t('detail.files', { n: detail.files.length })),
      h('div', { className: 'dsk-files' }, detail.files.slice(0, 60).map((file) => h('span', { className: 'dsk-file', key: file }, file)))),
    h('div', null,
      h('p', { className: 'dsk-section-title' }, t('detail.body')),
      h('pre', { className: 'dsk-pre' }, detail.body)),
  ]
}
