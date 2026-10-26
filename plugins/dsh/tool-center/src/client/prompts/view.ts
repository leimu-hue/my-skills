/**
 * 提示词域视图：每份预设自带作用范围，卡片上直接「启用 / 停用」。
 *
 * 没有页面级的「作用范围」选择器 —— 那个设计的问题是把范围做成了「你看哪一份」的视图状态，
 * 而它本应是**每一份预设自己的属性**：你可能同时有一份「工作区 A 的规矩」和一份「工作区 B 的
 * 规矩」，它们各自生效、互不干扰。
 *
 * 生效时机如实写在界面上：宿主每轮都会重新核对这些文件，所以启用 / 停用 / 改正文会影响已有
 * 会话的**下一轮**；文件方案做不到「只对新会话生效」。
 */
import { callOp } from '../core/api.js'
import { h, useClientEffect, useStateOf } from '../core/runtime.js'
import type { DomainProps } from '../core/domain.js'
import { useDomain } from '../core/domain.js'
import type { PromptPreset, PromptState, PromptTargetOption } from '../core/types.js'
import {
  actionsOf,
  alertOf,
  badgeOf,
  buttonOf,
  emptyOf,
  errorAlertOf,
  fieldOf,
  groupActionsOf,
  groupLineOf,
  groupOf,
  groupPathOf,
  headOf,
  inputOf,
  listOf,
  modalOf,
  mutedOf,
  selectOf,
  switchOf,
  textAreaOf,
  toolbarOf,
} from '../core/ui.js'

interface Draft {
  name: string
  content: string
  isNew: boolean
  scopeKind: 'global' | 'workspace'
  scopePath: string
}

export function PromptsView(props: DomainProps): unknown {
  const t = props.t
  const domain = useDomain<PromptState>('prompt-state', props.notify)
  const state = domain.state
  const [targets, setTargets] = useStateOf<PromptTargetOption[]>([])
  const [draft, setDraft] = useStateOf<Draft | null>(null)

  useClientEffect(() => {
    void callOp<{ options: PromptTargetOption[] }>('prompt-targets', {})
      .then((list) => setTargets(list.options))
      .catch(() => undefined)
  }, [])

  /** 「同一目标上的旧预设已被自动停用」这句只在真发生时追加。 */
  const withReplaced = (message: string) => (result: unknown): string => {
    const replaced = (result as { replaced?: string | null } | null)?.replaced
    return replaced === undefined || replaced === null
      ? message
      : `${message} · ${t('prompts.replaced', { name: replaced })}`
  }

  const presets = state?.presets ?? []
  const warnings = state?.warnings ?? []
  const applied = state?.applied ?? []
  const workspaceTargets = targets.filter((option) => option.kind === 'workspace')

  const badges: unknown[] = []
  if (presets.length > 0) badges.push(badgeOf(String(presets.length)))
  if (applied.length > 0) badges.push(badgeOf(t('prompts.activeCount', { n: applied.length }), 'ok'))
  if (state !== null) badges.push(badgeOf(t('prompts.backups', { n: state.backupCount }), 'off'))

  const alerts = [
    warnings.length > 0 ? alertOf(warnings.join(' · ')) : null,
    domain.error === null ? null : errorAlertOf(t, domain.error),
  ]

  return h('div', { className: 'dsk-root' },
    headOf({
      title: t('prompts.title'),
      badges,
      subtitle: t('prompts.subtitle'),
      muted: t('prompts.effectNote'),
      alerts,
    }),

    toolbarOf([
      actionsOf([buttonOf({
        label: t('prompts.new'),
        variant: 'primary',
        disabled: domain.busy !== '',
        onClick: () => setDraft({ name: '', content: '', isNew: true, scopeKind: 'global', scopePath: '' }),
      })]),
    ]),

    presets.length === 0
      ? emptyOf(t('prompts.empty'))
      : listOf(presets.map((preset) => renderPreset(t, preset, {
        busy: domain.busy,
        onToggle: (enabled) => {
          void domain.act(
            'prompt-toggle',
            { name: preset.name, enabled },
            withReplaced(enabled ? t('prompts.enabledMsg', { name: preset.name }) : t('prompts.disabledMsg', { name: preset.name })),
          )
        },
        onEdit: () => setDraft({
          name: preset.name,
          content: preset.content,
          isNew: false,
          scopeKind: preset.scope.kind,
          scopePath: preset.scope.kind === 'workspace' ? preset.scope.path : '',
        }),
        onDelete: () => {
          if (!window.confirm(t('prompts.confirmDelete', { name: preset.name }))) return
          void domain.act('prompt-delete', { name: preset.name })
        },
      }))),

    /* 生效中的目标一览：一眼看清「哪份写到了哪个文件」 */
    applied.length === 0
      ? null
      : groupOf('applied', [
        groupLineOf(t('prompts.appliedTargets'), [badgeOf(String(applied.length), 'off')], null),
      ], [
        h('div', { className: 'dsk-rows' }, applied.map((record) => h('div', {
          className: 'dsk-row',
          key: record.key,
          style: { cursor: 'default' },
        },
        h('div', { className: 'dsk-row-main' },
          h('div', { className: 'dsk-row-name' }, record.preset,
            record.drifted ? badgeOf(t('prompts.driftShort'), 'warn') : null),
          mutedOf(record.label),
          mutedOf(record.agentsPath)),
        h('div', { className: 'dsk-row-actions' }, mutedOf(new Date(record.at).toLocaleString()))))),
      ]),

    draft === null
      ? null
      : renderEditor(t, {
        draft,
        busy: domain.busy,
        workspaces: workspaceTargets,
        onChange: (patch) => setDraft({ ...draft, ...patch }),
        onCancel: () => setDraft(null),
        onSave: () => {
          if (draft.name.trim() === '' || draft.content.trim() === '') return
          const scope = draft.scopeKind === 'workspace' && draft.scopePath.trim() !== ''
            ? { kind: 'workspace', path: draft.scopePath.trim() }
            : { kind: 'global' }
          void domain.act(
            'prompt-save',
            { name: draft.name.trim(), content: draft.content, scope },
            t('prompts.saved'),
          ).then((done) => {
            if (done.ok) setDraft(null)
          })
        },
      }))
}

function renderPreset(
  t: DomainProps['t'],
  preset: PromptPreset,
  handlers: {
    busy: string
    onToggle(enabled: boolean): void
    onEdit(): void
    onDelete(): void
  },
): unknown {
  const disabled = handlers.busy !== ''
  return groupOf(preset.name, [
    groupLineOf(preset.name, [
      preset.enabled ? badgeOf(t('prompts.active'), 'ok') : badgeOf(t('prompts.inactive'), 'off'),
      badgeOf(t(preset.scope.kind === 'global' ? 'prompts.scopeGlobal' : 'prompts.scopeWorkspace'), undefined, preset.scope.path),
    ], groupActionsOf([
      buttonOf({ label: t('prompts.edit'), small: true, disabled, onClick: handlers.onEdit }),
      buttonOf({ label: t('prompts.delete'), small: true, variant: 'danger', disabled: disabled || preset.enabled, onClick: handlers.onDelete }),
      switchOf({
        on: preset.enabled,
        disabled,
        title: preset.enabled ? t('prompts.disable') : t('prompts.enable'),
        onClick: () => handlers.onToggle(!preset.enabled),
      }),
    ])),
    groupPathOf(preset.scope.label, preset.scope.path),
  ], [
    h('div', { className: 'dsk-row', style: { cursor: 'default' } },
      h('div', { className: 'dsk-row-main' },
        h('pre', { className: 'dsk-pre', style: { maxHeight: '96px', margin: 0 } },
          preset.content.length > 400 ? preset.content.slice(0, 400) + ' …' : preset.content)),
      h('div', { className: 'dsk-row-actions' },
        mutedOf(new Date(preset.updatedAt).toLocaleString()))),
  ])
}

function renderEditor(
  t: DomainProps['t'],
  props: {
    draft: Draft
    busy: string
    workspaces: PromptTargetOption[]
    onChange(patch: Partial<Draft>): void
    onCancel(): void
    onSave(): void
  },
): unknown {
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
      fieldOf(t('prompts.scope'), h('div', null,
        selectOf({
          value: draft.scopeKind === 'workspace' ? draft.scopePath : '',
          disabled: editing,
          options: [
            { value: '', label: t('prompts.scopeGlobal') },
            ...props.workspaces.map((option) => ({ value: option.path, label: option.label })),
          ],
          onChange: (path) => props.onChange(path === ''
            ? { scopeKind: 'global', scopePath: '' }
            : { scopeKind: 'workspace', scopePath: path }),
        }),
        mutedOf(t(editing ? 'prompts.scopeLockedHint' : 'prompts.scopeHint')))),
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
