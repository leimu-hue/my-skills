/**
 * 场景编辑器：名字 / 说明 / 切换行为 / 勾选技能与服务器 / 应用哪份提示词。
 *
 * 顺序是有意的：先读「用这个场景会发生什么」（整套切换的语义），再看具体勾选 ——
 * 否则一排复选框会让人以为只是在勾技能。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { DraftSources } from '../../lib/scenes/use-scenes.ts'
import type { SceneDraft, SkillRef } from '../../lib/core/types.ts'
import { alertOf, mutedOf } from '../ui/atoms.tsx'
import { buttonOf, fieldOf, inputOf, modalOf, selectOf } from '../ui/controls.tsx'

/** 技能行的稳定键。Host 侧用 `rowIdOf`；浏览器侧不能 import Host 代码，这里保持同一格式。 */
const refKeyOf = (root: string, name: string): string => root + '\u0000' + name

export interface DraftHandlers {
  draft: SceneDraft
  busy: string
  search: string
  sources: DraftSources
  onChange(patch: Partial<SceneDraft>): void
  onSearch(value: string): void
  onCancel(): void
  onSave(): void
}

export function renderDraft(t: Translate, props: DraftHandlers): ReactNode {
  const draft = props.draft
  const needle = props.search.trim().toLowerCase()
  const visibleSkills = (needle === ''
    ? props.sources.skills
    : props.sources.skills.filter((row) => row.label.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle))
  ).slice(0, 120)
  const picked = new Set(draft.skills.map((ref) => refKeyOf(ref.root, ref.name)))
  const preset = props.sources.presets.find((item) => item.name === draft.prompt)
  const presetNotWorkspace = preset !== undefined && preset.scope.kind !== 'workspace'

  const toggleSkill = (ref: SkillRef): void => {
    const key = refKeyOf(ref.root, ref.name)
    props.onChange({
      skills: picked.has(key)
        ? draft.skills.filter((existing) => !(existing.root === ref.root && existing.name === ref.name))
        : [...draft.skills, { root: ref.root, name: ref.name }],
    })
  }

  return modalOf(
    draft.isNew ? t('scenes.new') : `${t('scenes.edit')}: ${draft.name}`,
    [
      fieldOf(t('scenes.name'), inputOf({
        value: draft.name,
        disabled: draft.isNew === false,
        onChange: (name) => props.onChange({ name }),
      })),
      fieldOf(t('scenes.description'), inputOf({
        value: draft.description,
        onChange: (description) => props.onChange({ description }),
      })),

      /* ── 切换行为：先说清楚「用这个场景会发生什么」，再列具体勾选 ── */
      <div className='dsk-section' key='behaviour'>
        <p className='dsk-section-title'>{t('scenes.behaviourTitle')}</p>
        <label className='dsk-check'>
          <input
            type='checkbox'
            checked={draft.exclusive}
            onChange={() => props.onChange({ exclusive: !draft.exclusive })}
          />
          <span>{t('scenes.exclusive')}</span>
        </label>
        {mutedOf(draft.exclusive ? t('scenes.exclusiveOn') : t('scenes.exclusiveOff'))}
      </div>,

      <div className='dsk-section' key='pick'>
        <p className='dsk-section-title'>{t('scenes.pickTitle')}</p>
        {fieldOf(t('scenes.prompt'), (
          <div>
            {selectOf({
              value: draft.prompt,
              options: [
                { value: '', label: t('scenes.promptNone') },
                ...props.sources.presets.map((item) => ({ value: item.name, label: item.name })),
              ],
              onChange: (prompt) => props.onChange({ prompt }),
            })}
            {draft.prompt === '' ? null : mutedOf(preset?.scope.label ?? t('scenes.promptScopeFromPreset'))}
            {presetNotWorkspace ? alertOf(t('scenes.promptScopeNotWorkspace')) : null}
          </div>
        ))}
        {fieldOf(t('scenes.mcp'), (
          <div>
            {mutedOf(t('scenes.mcpGlobal'))}
            {props.sources.servers.length === 0
              ? mutedOf(t('scenes.noMcp'))
              : (
                <div className='dsk-files'>
                  {props.sources.servers.map((server) => {
                    const checked = draft.mcp.includes(server.id)
                    return (
                      <label className='dsk-file' key={server.id} style={{ cursor: 'pointer' }}>
                        <input
                          type='checkbox'
                          checked={checked}
                          onChange={() => props.onChange({
                            mcp: checked ? draft.mcp.filter((id) => id !== server.id) : [...draft.mcp, server.id],
                          })}
                        />
                        {server.name}
                        {server.on ? null : mutedOf(` (${t('mcp.disabled')})`)}
                      </label>
                    )
                  })}
                </div>
              )}
          </div>
        ))}

        {fieldOf(`${t('scenes.skills')} (${draft.skills.length})`, (
          <div>
            {inputOf({
              value: props.search,
              placeholder: t('common.search'),
              onChange: props.onSearch,
            })}
            {props.sources.skills.length === 0
              ? mutedOf(t('scenes.noSkills'))
              : (
                <div style={{ maxHeight: '180px', overflow: 'auto' }}>
                  {visibleSkills.map((row) => {
                    const key = refKeyOf(row.root, row.name)
                    return (
                      <label className='dsk-row' key={key} style={{ cursor: 'pointer' }}>
                        <div className='dsk-row-main'>
                          <div className='dsk-row-name'>{row.label}</div>
                          {mutedOf(row.rootLabel + (row.on ? '' : ` · ${t('row.disabled')}`))}
                        </div>
                        <input
                          type='checkbox'
                          checked={picked.has(key)}
                          onChange={() => toggleSkill({ root: row.root, name: row.name })}
                        />
                      </label>
                    )
                  })}
                </div>
              )}
          </div>
        ))}
      </div>,
    ],
    [
      buttonOf({ label: t('common.cancel'), onClick: props.onCancel }),
      buttonOf({ label: t('common.save'), variant: 'primary', disabled: props.busy !== '', onClick: props.onSave }),
    ],
  )
}
