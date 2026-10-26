/** 新建 / 编辑技能的模态表单。编辑时来源与名字都不可改（改名另走 update 的名字参数）。 */
import type { Translate } from '../i18n/index.js'
import type { RootView } from '../core/types.js'
import { buttonOf, fieldOf, inputOf, modalOf, selectOf, textAreaOf } from '../core/ui.js'

export interface FormState {
  mode: 'create' | 'edit'
  root: string
  name: string
  description: string
  whenToUse: string
  body: string
}

export interface FormHandlers {
  form: FormState
  roots: RootView[]
  busy: string
  onChange(patch: Partial<FormState>): void
  onCancel(): void
  onSave(): void
}

export function renderForm(t: Translate, props: FormHandlers): unknown {
  const form = props.form
  const create = form.mode === 'create'
  return modalOf(
    create ? t('form.createTitle') : t('form.editTitle'),
    [
      create
        ? fieldOf(t('form.root'), selectOf({
          value: form.root,
          onChange: (root) => props.onChange({ root }),
          options: props.roots.map((root) => ({ value: root.key, label: `${root.label} (${root.key})` })),
        }))
        : null,
      fieldOf(t('form.name'), inputOf({
        value: form.name,
        placeholder: 'my-skill',
        disabled: !create,
        onChange: (name) => props.onChange({ name }),
      })),
      fieldOf(t('form.description'), inputOf({
        value: form.description,
        onChange: (description) => props.onChange({ description }),
      })),
      fieldOf(t('form.whenToUse'), inputOf({
        value: form.whenToUse,
        onChange: (whenToUse) => props.onChange({ whenToUse }),
      })),
      fieldOf(t('form.body'), textAreaOf({
        value: form.body,
        onChange: (body) => props.onChange({ body }),
      })),
    ],
    [
      buttonOf({ label: t('common.cancel'), onClick: props.onCancel }),
      buttonOf({ label: t('common.save'), variant: 'primary', disabled: props.busy !== '', onClick: props.onSave }),
    ],
  )
}
