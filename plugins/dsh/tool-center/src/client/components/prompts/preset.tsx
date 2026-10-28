/**
 * 一份提示词预设的卡片。
 *
 * 层级按「一眼要回答的问题」排：**名字 + 状态**（用不用、用了没）→ **作用范围**（写到哪个文件）
 * → **正文摘要**（写了什么）→ **更新时间**（脚注）。
 *
 * 早先的排版把正文 `<pre>` 摆成主体、把时间浮在它右侧：一张卡上出现两个视觉中心，时间还悬在
 * 半空。现在时间归脚注、正文只留三行摘要 —— 完整正文去编辑器里看。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import { formatWhen } from '../../lib/core/format.ts'
import type { PromptPreset } from '../../lib/core/types.ts'
import { badgeOf } from '../ui/atoms.tsx'
import { buttonOf, switchOf } from '../ui/controls.tsx'

/** 摘要最多留这么多字：它只是「这是哪一份」的线索，不是正文。 */
const PREVIEW_CHARS = 240

export interface PresetHandlers {
  busy: string
  onToggle(enabled: boolean): void
  onEdit(): void
  onDelete(): void
}

export function renderPreset(t: Translate, preset: PromptPreset, handlers: PresetHandlers): ReactNode {
  const disabled = handlers.busy !== ''
  const scoped = preset.scope.kind === 'workspace'
  const target = scoped ? preset.scope.path : t('prompts.globalTarget')
  const preview = preset.content.replace(/\s+/g, ' ').trim()

  return (
    <article className='dsk-card' data-on={String(preset.enabled)} key={preset.name}>
      <div className='dsk-card-head'>
        <span className='dsk-card-name' title={preset.name}>{preset.name}</span>
        {preset.enabled ? badgeOf(t('prompts.active'), 'ok') : badgeOf(t('prompts.inactive'), 'off')}
        {badgeOf(scoped ? t('prompts.scopeWorkspace') : t('prompts.scopeGlobal'), undefined, target)}
        <div className='dsk-card-actions'>
          {buttonOf({ label: t('prompts.edit'), small: true, disabled, onClick: handlers.onEdit })}
          {buttonOf({
            label: t('prompts.delete'),
            small: true,
            variant: 'danger',
            disabled: disabled || preset.enabled,
            onClick: handlers.onDelete,
          })}
          {switchOf({
            on: preset.enabled,
            disabled,
            title: preset.enabled ? t('prompts.disable') : t('prompts.enable'),
            onClick: () => handlers.onToggle(!preset.enabled),
          })}
        </div>
      </div>

      {preview === '' ? null : (
        <p className='dsk-card-body'>
          {preview.length > PREVIEW_CHARS ? `${preview.slice(0, PREVIEW_CHARS)}…` : preview}
        </p>
      )}

      <div className='dsk-card-meta'>
        <span className='dsk-card-path' title={scoped ? target : undefined}>{target}</span>
        <span className='dsk-card-when'>{t('prompts.updatedAt', { when: formatWhen(preset.updatedAt) })}</span>
      </div>
    </article>
  )
}
