/** 单个项目行：可编辑的名称与备注、各项开关，以及操作按钮。 */
import { h, useReact } from '../core/runtime.js'
import { ConfirmButton, Toggle } from '../core/ui.js'
import type { Translate } from '../i18n/index.js'
import type { ProjectView } from '../core/types.js'

export interface RowProps {
  t: Translate
  project: ProjectView
  busy: boolean
  noteMax: number
  onUpdate(patch: Record<string, unknown>): void
  onRemove(): void
  onOpen(): void
}

export function ProjectRow(props: RowProps): unknown {
  const React = useReact()
  const t = props.t
  const project = props.project
  const [name, setName] = React.useState(project.name)
  const [note, setNote] = React.useState(project.note)

  React.useEffect(() => {
    setName(project.name)
  }, [project.name])
  React.useEffect(() => {
    setNote(project.note)
  }, [project.note])

  const commitName = (): void => {
    const next = name.trim()
    if (next === '') {
      setName(project.name)
      return
    }
    if (next !== project.name) props.onUpdate({ name: next })
  }

  return h('div', { className: 'rprj-row', 'data-missing': project.exists === false },
    h('div', { className: 'rprj-row-head' },
      h('input', {
        className: 'rprj-input rprj-input-name',
        value: name,
        placeholder: t('panel.namePlaceholder'),
        disabled: props.busy,
        onChange: (event: { target: HTMLInputElement }) => setName(event.target.value),
        onBlur: commitName,
        onKeyDown: (event: { key: string; currentTarget: HTMLInputElement }) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        },
      }),
      project.origin === 'agent' ? h('span', { className: 'rprj-tag' }, t('panel.agentAdded')) : null,
      project.exists === false ? h('span', { className: 'rprj-tag rprj-tag-error' }, t('panel.missing')) : null,
      h('span', { className: 'rprj-grow' }),
      h(Toggle, {
        checked: project.enabled,
        label: t('panel.enabled'),
        onChange: (next: boolean) => props.onUpdate({ enabled: next }),
      }),
      h('button', {
        type: 'button',
        className: 'rprj-btn rprj-btn-quiet',
        title: t('panel.open'),
        onClick: props.onOpen,
      }, '↗'),
      h(ConfirmButton, {
        title: t('panel.delete'),
        confirmText: t('panel.deleteConfirm', { name: project.name }),
        confirmLabel: t('panel.deleteYes'),
        cancelLabel: t('common.cancel'),
        onConfirm: props.onRemove,
      }, t('panel.delete'))),
    h('div', { className: 'rprj-row-path' }, project.path),
    h('textarea', {
      className: 'rprj-textarea',
      rows: 2,
      value: note,
      placeholder: t('panel.notePlaceholder'),
      maxLength: props.noteMax,
      disabled: props.busy,
      onChange: (event: { target: HTMLTextAreaElement }) => setNote(event.target.value),
      onBlur: () => {
        if (note !== project.note) props.onUpdate({ note })
      },
    }))
}
