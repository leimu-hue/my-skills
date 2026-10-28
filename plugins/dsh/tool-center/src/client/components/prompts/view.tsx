/**
 * 提示词域视图：每份预设自带作用范围，卡片上直接「启用 / 停用」。
 *
 * 版面按「先用哪个、再说规则」排：页头（有几份、几份生效、几份备份）→ 预设卡片列表 →
 * 生效目标脚注。那两句关于生效时机的长解释收进一个默认关闭的 `<details>`：它是第一次才需要
 * 读的说明，摆在列表上方只会把列表推下去。
 *
 * 生效时机如实写在界面上：宿主每轮都会重新核对这些文件，所以启用 / 停用 / 改正文会影响已有
 * 会话的**下一轮**；文件方案做不到「只对新会话生效」。
 */
import type { ReactNode } from 'react'
import type { DomainProps } from '../../lib/core/domain.ts'
import { formatWhen } from '../../lib/core/format.ts'
import { usePrompts } from '../../lib/prompts/use-prompts.ts'
import { alertOf, badgeOf, emptyOf } from '../ui/atoms.tsx'
import { buttonOf, errorAlertOf } from '../ui/controls.tsx'
import { actionsOf, headOf, listOf, toolbarOf } from '../ui/layout.tsx'
import { renderPreset } from './preset.tsx'
import { renderEditor } from './editor.tsx'

export function PromptsView(props: DomainProps): ReactNode {
  const t = props.t
  const prompts = usePrompts(t, props.notify)

  const badges: ReactNode[] = []
  if (prompts.presets.length > 0) badges.push(badgeOf(t('prompts.total', { n: prompts.presets.length })))
  if (prompts.applied.length > 0) badges.push(badgeOf(t('prompts.activeCount', { n: prompts.applied.length }), 'ok'))
  if (prompts.state !== null) badges.push(badgeOf(t('prompts.backups', { n: prompts.state.backupCount }), 'off'))

  return (
    <div className='dsk-root'>
      {headOf({
        title: t('prompts.title'),
        badges,
        subtitle: t('prompts.subtitle'),
        alerts: [
          prompts.warnings.length > 0 ? alertOf(prompts.warnings.join(' · ')) : null,
          prompts.error === null ? null : errorAlertOf(t, prompts.error),
        ],
      })}

      {/* 生效时机：默认收起。常看的是列表，这段解释只有第一次需要读。 */}
      <details className='dsk-hint'>
        <summary>{t('prompts.effectTitle')}</summary>
        <p>{t('prompts.effectNote')}</p>
      </details>

      {toolbarOf([
        actionsOf([buttonOf({
          label: t('prompts.new'),
          variant: 'primary',
          disabled: prompts.busy !== '',
          onClick: prompts.openNew,
        })]),
      ])}

      {prompts.presets.length === 0
        ? emptyOf(t('prompts.empty'))
        : listOf(prompts.presets.map((preset) => renderPreset(t, preset, {
          busy: prompts.busy,
          onToggle: (enabled) => prompts.toggle(preset, enabled),
          onEdit: () => prompts.openEdit(preset),
          onDelete: () => prompts.remove(preset),
        })))}

      {/* 生效中的目标一览：一份预设 → 写到了哪个 AGENTS.md，以及有没有被外部改过 */}
      {prompts.applied.length === 0
        ? null
        : (
          <section className='dsk-card' aria-label={t('prompts.appliedTargets')}>
            <div className='dsk-card-head'>
              <span className='dsk-card-name'>{t('prompts.appliedTargets')}</span>
              {badgeOf(String(prompts.applied.length), 'ok')}
            </div>
            <div className='dsk-rows'>
              {prompts.applied.map((record) => (
                <div className='dsk-row dsk-row-static' key={record.key}>
                  <div className='dsk-row-main'>
                    <div className='dsk-row-name'>
                      {record.preset}
                      {record.drifted ? badgeOf(t('prompts.driftShort'), 'warn') : null}
                    </div>
                    <div className='dsk-row-sub' title={record.agentsPath}>{record.label} · {record.agentsPath}</div>
                  </div>
                  <div className='dsk-row-actions dsk-row-when'>{formatWhen(record.at)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

      {prompts.draft === null
        ? null
        : renderEditor(t, {
          draft: prompts.draft,
          busy: prompts.busy,
          workspaces: prompts.workspaces,
          onChange: prompts.changeDraft,
          onCancel: prompts.cancelDraft,
          onSave: prompts.saveDraft,
        })}
    </div>
  )
}
