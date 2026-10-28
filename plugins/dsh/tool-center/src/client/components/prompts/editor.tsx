/**
 * 提示词编辑器：名字 + 作用范围 + 正文。
 *
 * 作用范围只在这里出现一次 —— 它在编辑时锁定（换范围等于换一份文件），所以编辑模式下
 * 下拉是禁用的，并说明原因。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { PromptDraft, PromptTargetOption } from '../../lib/core/types.ts'
import { mutedOf } from '../ui/atoms.tsx'
import { buttonOf, fieldOf, inputOf, modalOf, selectOf, textAreaOf } from '../ui/controls.tsx'

export interface EditorHandlers {
  draft: PromptDraft
  busy: string
  workspaces: PromptTargetOption[]
  onChange(patch: Partial<PromptDraft>): void
  onCancel(): void
  onSave(): void
}

export function renderEditor(t: Translate, props: EditorHandlers): ReactNode {
  const draft = props.draft
  const editing = draft.isNew === false
  return modalOf(
    draft.isNew ? t('prompts.new') : `${t('prompts.edit')}: ${draft.name}`,
    [
      fieldOf(t('prompts.name'), inputOf({
        value: draft.name,
        placeholder: 'coding',
        disabled: editing,
        onChange: (name) => props.onChange({ name }),
      })),
      /* 作用范围是这份预设的属性，所以放在编辑器里。 */
      fieldOf(t('prompts.scope'), (
        <div>
          {selectOf({
            value: draft.scopeKind === 'workspace' ? draft.scopePath : '',
            disabled: editing,
            options: [
              { value: '', label: t('prompts.scopeGlobal') },
              ...props.workspaces.map((option) => ({ value: option.path, label: option.label })),
            ],
            onChange: (path) => props.onChange(path === ''
              ? { scopeKind: 'global', scopePath: '' }
              : { scopeKind: 'workspace', scopePath: path }),
          })}
          {mutedOf(t(editing ? 'prompts.scopeLockedHint' : 'prompts.scopeHint'))}
        </div>
      )),
      fieldOf(t('prompts.content'), textAreaOf({
        value: draft.content,
        onChange: (content) => props.onChange({ content }),
      })),
    ],
    [
      buttonOf({ label: t('common.cancel'), onClick: props.onCancel }),
      buttonOf({ label: t('common.save'), variant: 'primary', disabled: props.busy !== '', onClick: props.onSave }),
    ],
  )
}
