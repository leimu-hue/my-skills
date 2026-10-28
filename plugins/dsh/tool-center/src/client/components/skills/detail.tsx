/**
 * 技能详情：右侧抽屉 + 遮罩。
 *
 * 两个刻意的细节：
 *   * **有遮罩**：抽屉不会把左侧列表压掉一块，也不会显得像「飘在窗口右边的一条」；
 *   * **点遮罩就关**：抽屉之外的任何位置（以及 Esc，见 `lib/use-skills.ts`）都能关掉它，
 *     不必先去找头部那个关闭按钮。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { SkillDetail } from '../../lib/core/types.ts'
import { alertOf, emptyOf } from '../ui/atoms.tsx'
import { buttonOf } from '../ui/controls.tsx'

export interface DetailHandlers {
  selected: { root: string; name: string }
  detail: SkillDetail | null
  busy: string
  onClose(): void
  onEdit(): void
  onDelete(): void
  onExport(): void
  /** 去宿主的合并目录里核验这条技能现在到底对模型可不可见。 */
  onVerify(): void
  onPrefer(preferred: boolean): void
}

export function renderDetail(t: Translate, props: DetailHandlers): ReactNode {
  const row = props.detail?.row
  const disabled = props.busy !== ''
  const action = (label: string, onClick: () => void, danger = false): ReactNode => buttonOf({
    label,
    small: true,
    disabled,
    variant: danger ? 'danger' : undefined,
    onClick,
  })

  return (
    <div className='dsk-panel-mask' onClick={props.onClose}>
      <div
        className='dsk-panel'
        role='dialog'
        aria-modal='true'
        aria-label={row?.declaredName ?? props.selected.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className='dsk-panel-head'>
          <div className='dsk-panel-title-row'>
            <h4 className='dsk-panel-title'>{row?.declaredName ?? props.selected.name}</h4>
            {buttonOf({ label: t('detail.close'), small: true, onClick: props.onClose })}
          </div>
          <div className='dsk-panel-actions'>
            {row !== undefined && row.rootWritable ? action(t('detail.edit'), props.onEdit) : null}
            {row === undefined ? null : action(t('detail.verify'), props.onVerify)}
            {row !== undefined
              ? action(row.preferred ? t('detail.unprefer') : t('detail.prefer'), () => props.onPrefer(row.preferred !== true))
              : null}
            {row !== undefined ? action(t('detail.export'), props.onExport) : null}
            {row !== undefined && row.rootWritable ? action(t('detail.delete'), props.onDelete, true) : null}
          </div>
        </div>
        <div className='dsk-panel-body'>
          {props.detail === null ? emptyOf(t('detail.busy')) : bodyOf(t, props.detail)}
        </div>
      </div>
    </div>
  )
}

/** 详情正文的各个段落（顺序与阅读顺序一致）。 */
function bodyOf(t: Translate, detail: SkillDetail): ReactNode[] {
  const row = detail.row
  return [
    <div className='dsk-kv' key='kv'>
      <span className='dsk-kv-key'>{t('detail.path')}</span>
      <span className='dsk-kv-val'>{row.docPath}</span>
      <span className='dsk-kv-key'>root</span>
      <span className='dsk-kv-val'>{`${row.rootKey} · rank ${row.rootRank}`}</span>
    </div>,
    row.problem === undefined ? null : alertOf(`${t('detail.problem')}：${row.problem}`),
    row.whenToUse === undefined
      ? null
      : (
        <div key='when'>
          <p className='dsk-section-title'>whenToUse</p>
          <div className='dsk-row-desc'>{row.whenToUse}</div>
        </div>
      ),
    <div key='frontmatter'>
      <p className='dsk-section-title'>{t('detail.frontmatter')}</p>
      <pre className='dsk-pre'>{JSON.stringify(detail.frontmatter, null, 2)}</pre>
    </div>,
    <div key='files'>
      <p className='dsk-section-title'>{t('detail.files', { n: detail.files.length })}</p>
      <div className='dsk-files'>
        {detail.files.slice(0, 60).map((file) => <span className='dsk-file' key={file}>{file}</span>)}
      </div>
    </div>,
    <div key='body'>
      <p className='dsk-section-title'>{t('detail.body')}</p>
      <pre className='dsk-pre'>{detail.body}</pre>
    </div>,
  ]
}
