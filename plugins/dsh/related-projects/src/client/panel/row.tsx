/** 单个项目行：可编辑的名称与备注、各项开关，以及操作按钮。 */
import { useState, type ReactNode } from 'react'
import { ConfirmButton, Toggle } from '../core/ui.js'
import type { Translate } from '../i18n/index.js'
import type { ProjectPatch, ProjectView } from '../core/types.js'

export interface RowProps {
  t: Translate
  project: ProjectView
  busy: boolean
  nameMax: number
  noteMax: number
  onUpdate(patch: ProjectPatch): void
  onRemove(): void
  onOpen(): void
}

export function ProjectRow(props: RowProps): ReactNode {
  const t = props.t
  const project = props.project
  /* 草稿记着自己是从哪个服务端值起步的：服务端值一变就立即跟随，不需要
     `useEffect` 再渲染一遍；而 `source` 始终取当前值，所以保存后的新名字
     不会把正在输入的文本弹回去。 */
  const [nameDraft, setNameDraft] = useState({ source: project.name, value: project.name })
  const [noteDraft, setNoteDraft] = useState({ source: project.note, value: project.note })
  const name = nameDraft.source === project.name ? nameDraft.value : project.name
  const note = noteDraft.source === project.note ? noteDraft.value : project.note

  const commitName = (): void => {
    const next = name.trim()
    if (next === '') {
      setNameDraft({ source: project.name, value: project.name })
      return
    }
    if (next !== project.name) props.onUpdate({ name: next })
  }

  return (
    <div className='rprj-row' data-missing={project.exists === false}>
      <div className='rprj-row-head'>
        <input
          className='rprj-input rprj-input-name'
          name='related-project-name'
          value={name}
          maxLength={props.nameMax}
          autoComplete='off'
          spellCheck={false}
          aria-label={t('panel.name')}
          placeholder={t('panel.namePlaceholder')}
          disabled={props.busy}
          onChange={(event) => setNameDraft({ source: project.name, value: event.target.value })}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        {project.origin === 'agent' ? <span className='rprj-tag'>{t('panel.agentAdded')}</span> : null}
        {project.exists === false
          ? <span className='rprj-tag rprj-tag-error'>{t('panel.missing')}</span>
          : null}
        <span className='rprj-grow' />
        <Toggle
          checked={project.enabled}
          label={t('panel.enabled')}
          onChange={(next) => props.onUpdate({ enabled: next })}
        />
        <button
          type='button'
          className='rprj-btn rprj-btn-quiet'
          title={t('panel.open')}
          aria-label={t('panel.open')}
          onClick={props.onOpen}
        >
          <span aria-hidden>↗</span>
        </button>
        <ConfirmButton
          title={t('panel.delete')}
          confirmText={t('panel.deleteConfirm', { name: project.name })}
          confirmLabel={t('panel.deleteYes')}
          cancelLabel={t('common.cancel')}
          onConfirm={props.onRemove}
        >
          {t('panel.delete')}
        </ConfirmButton>
      </div>
      <div className='rprj-row-path'>{project.path}</div>
      <textarea
        className='rprj-textarea'
        name='related-project-note'
        rows={2}
        value={note}
        maxLength={props.noteMax}
        aria-label={t('panel.note')}
        placeholder={t('panel.notePlaceholder')}
        disabled={props.busy}
        onChange={(event) => setNoteDraft({ source: project.note, value: event.target.value })}
        onBlur={() => {
          if (note !== project.note) props.onUpdate({ note })
        }}
      />
    </div>
  )
}
