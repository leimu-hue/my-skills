/**
 * 场景域视图：上半是**场景定义**（可复用），下半是**工作区各自选择用哪个**。
 *
 * 这个分工是被用户纠正过的：场景不该在创建时锁死到一个工作区（那样同一个场景没法给
 * 第二个项目用）。正确的关系是「场景是被选择的，工作区是选择的人」—— 所以列表里不再有
 * 「未绑定工作区」这种半成品状态，也没有「进入场景」按钮；改由每个工作区那一行去选。
 *
 * 会话级的再选择不在这里（面板没有会话上下文）：那是 `/scene` 与「新会话页」的活。
 */
import { callOp } from '../core/api.js'
import { h, useClientEffect, useStateOf } from '../core/runtime.js'
import type { DomainProps } from '../core/domain.js'
import { useDomain, noticeWithWarnings } from '../core/domain.js'
import type {
  McpStateView,
  PromptState,
  PromptTargetOption,
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

/** 技能行的稳定键。Host 侧用 `rowIdOf`；浏览器侧不能 import Host 代码，这里保持同一格式。 */
const refKeyOf = (root: string, name: string): string => root + '\u0000' + name

interface Draft {
  name: string
  description: string
  isNew: boolean
  skills: SkillRef[]
  mcp: string[]
  prompt: string
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
  presets: PromptState['presets']
}

/**
 * 工作区路径是否同一个。
 *
 * 这是**宿主 `shared/paths.ts` 的 `samePath` 的镜像**，不是第二套规则：浏览器半侧不能 import
 * Host 代码（另一个 bundle、另一套运行时），所以只能照抄语义 —— 空串不等于任何路径、
 * 统一分隔符、盘符路径忽略大小写。改这里必须同时改宿主那一份，否则「界面里选中的工作区」
 * 与「宿主实际生效的工作区」会不是同一个。
 */
function samePath(left: string, right: string): boolean {
  const norm = (value: string): string => {
    const slashed = value.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '')
    return /^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed
  }
  return left !== '' && right !== '' && norm(left) === norm(right)
}


export function ScenesView(props: DomainProps): unknown {
  const t = props.t
  const domain = useDomain<ScenesStateView>('scene-state', props.notify)
  const state = domain.state
  const [skills, setSkills] = useStateOf<SkillStateView | null>(null)
  const [mcp, setMcp] = useStateOf<McpStateView | null>(null)
  const [prompts, setPrompts] = useStateOf<PromptState | null>(null)
  const [targets, setTargets] = useStateOf<PromptTargetOption[]>([])
  const [draft, setDraft] = useStateOf<Draft | null>(null)
  const [search, setSearch] = useStateOf('')

  /** 工作区清单来自宿主的工作区登记表（`prompt-targets` 已经把它吐出来了，复用即可）。 */
  useClientEffect(() => {
    void callOp<{ options: PromptTargetOption[] }>('prompt-targets', {})
      .then((data) => setTargets(data.options ?? []))
      .catch(() => setTargets([]))
  }, [])

  const workspaces = targets.filter((option) => option.kind === 'workspace')

  /** 编辑器要的三份清单来自各自的域，所以这里只读它们的状态，不维护副本。 */
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
    presets: prompts?.presets ?? [],
  }

  const scenes = state?.scenes ?? []
  const active = state?.active ?? {}
  const sessions = state?.sessions ?? {}
  const warnings = state?.warnings ?? []


  /** 这个场景被多少工作区当作默认、被多少会话自己选中。 */
  const usageOf = (scene: SceneRow): { workspaces: number; sessions: number } => ({
    workspaces: Object.values(active).filter((name) => name === scene.name).length,
    sessions: Object.values(sessions).filter((choice) => choice.scene === scene.name).length,
  })

  const sessionOverrides = Object.keys(sessions).length
  const badges: unknown[] = []
  if (scenes.length > 0) badges.push(badgeOf(String(scenes.length)))
  if (Object.keys(active).length > 0) badges.push(badgeOf(`${t('scenes.workspacesUsing')} ${Object.keys(active).length}`, 'ok'))
  if (sessionOverrides > 0) badges.push(badgeOf(`${t('scenes.sessionsUsing')} ${sessionOverrides}`, 'off'))

  const openDraft = (next: Draft): void => {
    setDraft(next)
    void loadSources()
  }

  const openNew = (): void => openDraft({
    name: '',
    description: '',
    isNew: true,
    skills: [],
    mcp: [],
    prompt: '',
    exclusive: true,
  })

  const openEdit = (scene: SceneRow): void => openDraft({
    name: scene.name,
    description: scene.description,
    isNew: false,
    skills: scene.skills.slice(),
    mcp: scene.mcp.slice(),
    prompt: scene.prompt ?? '',
    exclusive: scene.exclusive !== false,
  })

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
        buttonOf({ label: t('scenes.new'), variant: 'primary', disabled: domain.busy !== '', onClick: openNew }),
      ]),
    ]),

    scenes.length === 0
      ? emptyOf(t('scenes.empty'))
      : listOf(scenes.map((scene) => {
        const usage = usageOf(scene)
        return groupOf(scene.name, [
          h('span', { className: 'dsk-group-name' }, scene.name),
          usage.workspaces > 0 ? badgeOf(t('scenes.usedByWorkspaces', { n: usage.workspaces }), 'ok') : null,
          usage.sessions > 0 ? badgeOf(t('scenes.usedBySessions', { n: usage.sessions }), 'off') : null,
          scene.skills.length > 0 ? badgeOf(t('scenes.count.skills', { n: scene.skills.length }), 'off') : null,
          scene.mcp.length > 0 ? badgeOf(t('scenes.count.mcp', { n: scene.mcp.length }), 'off') : null,
          scene.prompt === null ? null : badgeOf(`${t('scenes.prompt')}: ${scene.prompt}`, 'off'),
          groupActionsOf([
            buttonOf({ label: t('scenes.edit'), small: true, disabled: domain.busy !== '', onClick: () => openEdit(scene) }),
            buttonOf({
              label: t('scenes.delete'),
              small: true,
              variant: 'danger',
              disabled: domain.busy !== '' || usage.workspaces > 0 || usage.sessions > 0,
              onClick: () => {
                if (!window.confirm(t('scenes.confirmDelete', { name: scene.name }))) return
                void domain.act('scene-delete', { name: scene.name })
              },
            }),
          ]),
        ], [
          scene.description === '' ? null : mutedOf(scene.description),
        ])
      })),

    /* ── 工作区各自选择用哪个场景 ── */
    h('div', { className: 'dsk-section' },
      h('p', { className: 'dsk-section-title' }, t('scenes.byWorkspace')),
      mutedOf(t('scenes.byWorkspaceHint')),
      workspaces.length === 0
        ? mutedOf(t('scenes.noWorkspaces'))
        : h('div', null, workspaces.map((workspace) => {
          const key = Object.keys(active).find((candidate) => samePath(candidate, workspace.path))
          const value = key === undefined ? '' : active[key]
          return h('div', { className: 'dsk-row', key: workspace.path },
            h('div', { className: 'dsk-row-main' },
              h('div', { className: 'dsk-row-name' }, workspace.label),
              mutedOf(workspace.path)),
            selectOf({
              value,
              options: [
                { value: '', label: t('scenes.workspaceNone') },
                ...scenes.map((scene) => ({ value: scene.name, label: scene.name })),
              ],
              onChange: (next) => {
                void domain.act(
                  'scene-workspace',
                  { workspace: workspace.path, scene: next === '' ? null : next },
                  (result) => noticeWithWarnings(
                    next === '' ? t('scenes.workspaceCleared') : t('scenes.workspaceApplied', { name: next }),
                    result,
                  ),
                )
              },
            }))
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
          if (draft.name.trim() === '') {
            domain.fail(t('scenes.nameRequired'))
            return
          }
          void domain.act('scene-save', {
            name: draft.name.trim(),
            description: draft.description,
            skills: draft.skills,
            mcp: draft.mcp,
            prompt: draft.prompt === '' ? null : draft.prompt,
            exclusive: draft.exclusive,
          }, t('common.save')).then((done) => {
            if (done.ok) setDraft(null)
          })
        },
      })
  )
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
  const preset = props.sources.presets.find((item) => item.name === draft.prompt)
  const presetNotWorkspace = preset !== undefined && preset.scope.kind !== 'workspace'

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
              ...props.sources.presets.map((item) => ({ value: item.name, label: item.name })),
            ],
            onChange: (prompt) => props.onChange({ prompt }),
          }),
          draft.prompt === '' ? null : mutedOf(preset?.scope.label ?? t('scenes.promptScopeFromPreset')),
          presetNotWorkspace ? alertOf(t('scenes.promptScopeNotWorkspace')) : null)),
        fieldOf(t('scenes.mcp'), h('div', null,
          mutedOf(t('scenes.mcpGlobal')),
          props.sources.servers.length === 0
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
            })))),

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
