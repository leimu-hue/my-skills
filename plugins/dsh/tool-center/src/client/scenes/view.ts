/**
 * 场景域视图：场景列表 + 「进入 / 退出」+ 编辑器。
 *
 * 编辑器是三样东西的组合：要启用的技能、要启用的 MCP 服务器、要应用的提示词预设。
 * 技能与服务器的清单都从各自的域读，所以这里不会有一份会漂移的副本。
 */
import { callOp } from '../core/api.js'
import { h, useStateOf } from '../core/runtime.js'
import type { DomainProps } from '../core/domain.js'
import { useDomain, noticeWithWarnings } from '../core/domain.js'
import type {
  McpStateView,
  PromptState,
  SceneRow,
  ScenesStateView,
  SkillRef,
  SkillStateView,
} from '../core/types.js'
import {
  actionsOf,
  alertOf,
  badgeOf,
  buttonOf,
  emptyOf,
  errorAlertOf,
  fieldOf,
  groupActionsOf,
  groupOf,
  headOf,
  inputOf,
  listOf,
  modalOf,
  mutedOf,
  selectOf,
  toolbarOf,
} from '../core/ui.js'

/** 技能行的稳定键。Host 侧用 owIdOf；浏览器侧不能 import Host 代码，这里保持同一格式。 */
const refKeyOf = (root: string, name: string): string => root + '\u0000' + name

interface Draft {
  name: string
  description: string
  isNew: boolean
  /** 要启用的技能（白名单）。 */
  skills: SkillRef[]
  /** 要启用的 MCP 服务器 id（白名单）。 */
  mcp: string[]
  prompt: string
  /** 提示词作用范围（由预设自己决定，编辑器只负责原样带回去）。 */
  promptScope: 'global' | 'workspace'
  promptWorkspace: string
  /** 整套切换：未选中的关掉。 */
  exclusive: boolean
}

interface SkillOption {
  root: string
  name: string
  label: string
  rootLabel: string
  on: boolean
}

interface DraftSources {
  skills: SkillOption[]
  servers: { id: string; name: string; on: boolean }[]
  presets: string[]
}

export function ScenesView(props: DomainProps): unknown {
  const t = props.t
  const domain = useDomain<ScenesStateView>('scene-state', props.notify)
  const state = domain.state
  const [skills, setSkills] = useStateOf<SkillStateView | null>(null)
  const [mcp, setMcp] = useStateOf<McpStateView | null>(null)
  const [prompts, setPrompts] = useStateOf<PromptState | null>(null)
  const [draft, setDraft] = useStateOf<Draft | null>(null)
  const [search, setSearch] = useStateOf('')

  /**
   * 编辑器要的三份清单来自各自的域，所以这里只读它们的状态，不维护副本。
   * 挂在 draft 打开时才算：不开编辑器就不必付这三个请求。
   */
  const loadSources = async (): Promise<void> => {
    const [skillState, mcpState, promptState] = await Promise.all([
      callOp<SkillStateView>('state', {}).catch(() => null),
      callOp<McpStateView>('mcp-state', {}).catch(() => null),
      callOp<PromptState>('prompt-state', {}).catch(() => null),
    ])
    setSkills(skillState)
    setMcp(mcpState)
    setPrompts(promptState)
  }

  const sources: DraftSources = {
    skills: skills?.roots.flatMap((root) => root.skills
      .filter((row) => !row.shadowed)
      .map((row) => ({
        root: root.key,
        name: row.name,
        label: row.declaredName,
        rootLabel: root.label,
        on: row.policy.skillOn,
      }))) ?? [],
    servers: mcp?.servers.map((server) => ({ id: server.id, name: server.name, on: server.enabled })) ?? [],
    presets: prompts?.presets.map((preset) => preset.name) ?? [],
  }

  const scenes = state?.scenes ?? []
  const active = state?.active ?? null
  const warnings = state?.warnings ?? []

  const badges: unknown[] = []
  if (scenes.length > 0) badges.push(badgeOf(String(scenes.length)))
  if (active !== null) badges.push(badgeOf(`${t('scenes.active')}: ${active}`, 'ok'))

  const openDraft = (next: Draft): void => {
    setDraft(next)
    void loadSources()
  }

  return h('div', { className: 'dsk-root' },
    headOf({
      title: t('scenes.title'),
      badges,
      subtitle: t('scenes.subtitle'),
      alerts: [
        warnings.length > 0 ? alertOf(warnings.join(' · ')) : null,
        domain.error === null ? null : errorAlertOf(t, domain.error),
      ],
    }),

    toolbarOf([
      actionsOf([
        buttonOf({
          label: t('scenes.new'),
          variant: 'primary',
          disabled: domain.busy !== '',
          onClick: () => openDraft({
            name: '',
            description: '',
            isNew: true,
            skills: [],
            mcp: [],
            prompt: '',
            promptScope: 'global',
            promptWorkspace: '',
            exclusive: true,
          }),
        }),
        active === null
          ? null
          : buttonOf({
            label: t('scenes.exit'),
            disabled: domain.busy !== '',
            onClick: () => { void domain.act('scene-exit', {}, (result) => noticeWithWarnings(t('scenes.exited'), result)) },
          }),
      ]),
    ]),

    scenes.length === 0
      ? emptyOf(t('scenes.empty'))
      : listOf(scenes.map((scene) => renderScene(t, scene, {
        busy: domain.busy,
        active,
        onApply: () => {
          void domain.act(
            'scene-apply',
            { name: scene.name },
            (result) => noticeWithWarnings(t('scenes.applied', { name: scene.name }), result),
          )
        },
        onEdit: () => openDraft({
          name: scene.name,
          description: scene.description,
          isNew: false,
          skills: scene.skills.slice(),
          mcp: scene.mcp.slice(),
          prompt: scene.prompt ?? '',
          promptScope: scene.promptTarget?.scope === 'workspace' ? 'workspace' : 'global',
          promptWorkspace: scene.promptTarget?.workspace ?? '',
          exclusive: scene.exclusive !== false,
        }),
        onDelete: () => {
          if (!window.confirm(t('scenes.confirmDelete', { name: scene.name }))) return
          void domain.act('scene-delete', { name: scene.name })
        },
      }))),

    draft === null
      ? null
      : renderDraft(t, {
        draft,
        busy: domain.busy,
        search,
        sources,
        onChange: (patch) => setDraft({ ...draft, ...patch }),
        onSearch: setSearch,
        onCancel: () => setDraft(null),
        onSave: () => {
          if (draft.name.trim() === '') return
          void domain.act('scene-save', {
            name: draft.name.trim(),
            description: draft.description,
            skills: draft.skills,
            mcp: draft.mcp,
            prompt: draft.prompt === '' ? null : draft.prompt,
            promptTarget: draft.promptScope === 'workspace' && draft.promptWorkspace.trim() !== ''
              ? { scope: 'workspace', workspace: draft.promptWorkspace.trim() }
              : { scope: 'global' },
            exclusive: draft.exclusive,
          }, t('common.save')).then((done) => {
            if (done.ok) setDraft(null)
          })
        },
      }))
}

function renderScene(
  t: DomainProps['t'],
  scene: SceneRow,
  handlers: {
    busy: string
    active: string | null
    onApply(): void
    onEdit(): void
    onDelete(): void
  },
): unknown {
  const isActive = handlers.active === scene.name
  const disabled = handlers.busy !== ''
  return groupOf(scene.name, [
    h('span', { className: 'dsk-group-name' }, scene.name),
    isActive ? badgeOf(t('scenes.active'), 'ok') : null,
    scene.skills.length > 0 ? badgeOf(t('scenes.count.skills', { n: scene.skills.length }), 'off') : null,
    scene.mcp.length > 0 ? badgeOf(t('scenes.count.mcp', { n: scene.mcp.length }), 'off') : null,
    scene.prompt === null ? null : badgeOf(`${t('scenes.prompt')}: ${scene.prompt}`, 'off'),
    groupActionsOf([
      buttonOf({ label: t('scenes.apply'), small: true, disabled: disabled || isActive, onClick: handlers.onApply }),
      buttonOf({ label: t('scenes.edit'), small: true, disabled, onClick: handlers.onEdit }),
      buttonOf({ label: t('scenes.delete'), small: true, variant: 'danger', disabled: disabled || isActive, onClick: handlers.onDelete }),
    ]),
  ], [
    scene.description === '' ? null : mutedOf(scene.description),
  ])
}

function renderDraft(
  t: DomainProps['t'],
  props: {
    draft: Draft
    busy: string
    search: string
    sources: DraftSources
    onChange(patch: Partial<Draft>): void
    onSearch(value: string): void
    onCancel(): void
    onSave(): void
  },
): unknown {
  const draft = props.draft
  const needle = props.search.trim().toLowerCase()
  const visibleSkills = (needle === ''
    ? props.sources.skills
    : props.sources.skills.filter((row) => row.label.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle))
  ).slice(0, 120)
  const picked = new Set(draft.skills.map((ref) => refKeyOf(ref.root, ref.name)))

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

      /* ── 切换行为：先说清楚「进这个场景会做什么」，再列具体勾选 ── */
      h('div', { className: 'dsk-section' },
        h('p', { className: 'dsk-section-title' }, t('scenes.behaviourTitle')),
        h('label', { className: 'dsk-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.exclusive,
            onChange: () => props.onChange({ exclusive: !draft.exclusive }),
          }),
          h('span', null, t('scenes.exclusive'))),
        mutedOf(draft.exclusive ? t('scenes.exclusiveOn') : t('scenes.exclusiveOff'))),

      h('div', { className: 'dsk-section' },
        h('p', { className: 'dsk-section-title' }, t('scenes.pickTitle')),
        fieldOf(t('scenes.prompt'), h('div', null,
          selectOf({
            value: draft.prompt,
            options: [
              { value: '', label: t('scenes.promptNone') },
              ...props.sources.presets.map((name) => ({ value: name, label: name })),
            ],
            onChange: (prompt) => props.onChange({ prompt }),
          }),
          /* 作用范围由那份预设自己决定，这里只说明，避免让人再选一次。 */
          draft.prompt === '' ? null : mutedOf(t('scenes.promptScopeFromPreset')))),
        fieldOf(t('scenes.mcp'), props.sources.servers.length === 0
          ? mutedOf(t('scenes.noMcp'))
          : h('div', { className: 'dsk-files' }, props.sources.servers.map((server) => {
            const checked = draft.mcp.includes(server.id)
            return h('label', { className: 'dsk-file', key: server.id, style: { cursor: 'pointer' } },
              h('input', {
                type: 'checkbox',
                checked,
                onChange: () => props.onChange({
                  mcp: checked ? draft.mcp.filter((id) => id !== server.id) : [...draft.mcp, server.id],
                }),
              }),
              server.name,
              server.on ? null : mutedOf(` (${t('mcp.disabled')})`))
          }))),

        fieldOf(`${t('scenes.skills')} (${draft.skills.length})`, h('div', null,
          inputOf({
            value: props.search,
            placeholder: t('common.search'),
            onChange: props.onSearch,
          }),
          props.sources.skills.length === 0
            ? mutedOf(t('scenes.noSkills'))
            : h('div', { style: { maxHeight: '180px', overflow: 'auto' } }, visibleSkills.map((row) => {
              const key = refKeyOf(row.root, row.name)
              return h('label', { className: 'dsk-row', key, style: { cursor: 'pointer' } },
                h('div', { className: 'dsk-row-main' },
                  h('div', { className: 'dsk-row-name' }, row.label),
                  mutedOf(row.rootLabel + (row.on ? '' : ` · ${t('row.disabled')}`))),
                h('input', {
                  type: 'checkbox',
                  checked: picked.has(key),
                  onChange: () => props.onChange({
                    skills: picked.has(key)
                      ? draft.skills.filter((ref) => !(ref.root === row.root && ref.name === row.name))
                      : [...draft.skills, { root: row.root, name: row.name }],
                  }),
                }))
            })))),
      ),
    ],
    [
      buttonOf({ label: t('common.cancel'), onClick: props.onCancel }),
      buttonOf({ label: t('common.save'), variant: 'primary', disabled: props.busy !== '', onClick: props.onSave }),
    ],
  )
}
