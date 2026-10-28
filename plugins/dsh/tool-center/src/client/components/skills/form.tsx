/**
 * 新建 / 编辑技能的模态表单。
 *
 * 没有「落到哪个来源」的下拉：`import` 与 `local` 这两个键名对用户没有意义，新建就是放进
 * 自己的技能目录（见 `lib/skills.ts` 的 `createTargetOf`）。编辑时名字与来源同样不可改。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { SkillFormState } from '../../lib/core/types.ts'
import { buttonOf, fieldOf, inputOf, modalOf, textAreaOf } from '../ui/controls.tsx'

export interface FormHandlers {
  form: SkillFormState
  busy: string
  onChange(patch: Partial<SkillFormState>): void
  onCancel(): void
  onSave(): void
}

export function renderForm(t: Translate, props: FormHandlers): ReactNode {
  const form = props.form
  const create = form.mode === 'create'
  return modalOf(
    create ? t('form.createTitle') : t('form.editTitle'),
    [
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
