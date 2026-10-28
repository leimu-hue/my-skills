/**
 * 提示词域的逻辑：预设列表、作用范围选项、编辑器草稿。
 *
 * 没有页面级的「作用范围」选择器 —— 那个设计的问题是把范围做成了「你看哪一份」的视图状态，
 * 而它本应是**每一份预设自己的属性**：你可能同时有一份「工作区 A 的规矩」和一份「工作区 B 的
 * 规矩」，它们各自生效、互不干扰。所以范围只出现在编辑器里，取的是这份预设自己的 scope。
 */
import { useEffect, useState } from 'react'
import { callOp } from '../core/api.ts'
import { useDomain, type DomainFailure } from '../core/domain.ts'
import type { AppliedTarget, PromptDraft, PromptPreset, PromptState, PromptTargetOption } from '../core/types.ts'
import type { Translate } from '../../i18n/index.ts'

export interface PromptsController {
  state: PromptState | null
  busy: string
  error: DomainFailure | null
  presets: PromptPreset[]
  applied: AppliedTarget[]
  warnings: string[]
  /** 可用的工作区范围（宿主工作区登记表）。 */
  workspaces: PromptTargetOption[]
  draft: PromptDraft | null
  reload(): void
  openNew(): void
  openEdit(preset: PromptPreset): void
  changeDraft(patch: Partial<PromptDraft>): void
  cancelDraft(): void
  saveDraft(): void
  toggle(preset: PromptPreset, enabled: boolean): void
  remove(preset: PromptPreset): void
}

export function usePrompts(t: Translate, notify: (message: string) => void): PromptsController {
  const domain = useDomain<PromptState>('prompt-state', notify)
  const state = domain.state
  const [targets, setTargets] = useState<PromptTargetOption[]>([])
  const [draft, setDraft] = useState<PromptDraft | null>(null)

  useEffect(() => {
    void callOp<{ options: PromptTargetOption[] }>('prompt-targets', {})
      .then((list) => setTargets(list.options ?? []))
      .catch(() => undefined)
  }, [])

  /** 「同一目标上的旧预设已被自动停用」这句只在真发生时追加。 */
  const withReplaced = (message: string) => (result: unknown): string => {
    const replaced = (result as { replaced?: string | null } | null)?.replaced
    return replaced === undefined || replaced === null
      ? message
      : `${message} · ${t('prompts.replaced', { name: replaced })}`
  }

  return {
    state,
    busy: domain.busy,
    error: domain.error,
    presets: state?.presets ?? [],
    applied: state?.applied ?? [],
    warnings: state?.warnings ?? [],
    workspaces: targets.filter((option) => option.kind === 'workspace'),
    draft,

    reload: () => { void domain.reload() },
    openNew: () => setDraft({ name: '', content: '', isNew: true, scopeKind: 'global', scopePath: '' }),
    openEdit: (preset) => setDraft({
      name: preset.name,
      content: preset.content,
      isNew: false,
      scopeKind: preset.scope.kind,
      scopePath: preset.scope.kind === 'workspace' ? preset.scope.path : '',
    }),
    changeDraft: (patch) => setDraft((current) => (current === null ? current : { ...current, ...patch })),
    cancelDraft: () => setDraft(null),
    saveDraft: () => {
      if (draft === null) return
      if (draft.name.trim() === '' || draft.content.trim() === '') return
      const scope = draft.scopeKind === 'workspace' && draft.scopePath.trim() !== ''
        ? { kind: 'workspace' as const, path: draft.scopePath.trim() }
        : { kind: 'global' as const }
      void domain.act(
        'prompt-save',
        { name: draft.name.trim(), content: draft.content, scope },
        t('prompts.saved'),
      ).then((done) => {
        if (done.ok) setDraft(null)
      })
    },
    toggle: (preset, enabled) => {
      void domain.act(
        'prompt-toggle',
        { name: preset.name, enabled },
        withReplaced(enabled
          ? t('prompts.enabledMsg', { name: preset.name })
          : t('prompts.disabledMsg', { name: preset.name })),
      )
    },
    remove: (preset) => {
      if (!window.confirm(t('prompts.confirmDelete', { name: preset.name }))) return
      void domain.act('prompt-delete', { name: preset.name })
    },
  }
}
