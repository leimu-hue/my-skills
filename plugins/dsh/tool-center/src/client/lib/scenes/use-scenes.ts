/**
 * 场景域的逻辑：场景定义、工作区默认、编辑器草稿。
 *
 * 这个分工是被用户纠正过的：场景不该在创建时锁死到一个工作区（那样同一个场景没法给
 * 第二个项目用）。正确的关系是「场景是被选择的，工作区是选择的人」—— 所以这里没有
 * 「进入场景」这种半成品状态，改由每个工作区那一行去选。
 *
 * 会话级的再选择不在这里（面板没有会话上下文）：那是 `/scene` 与「新会话页」的活，
 * 见 `commands/scene.ts` 与 `components/scenes/hero.tsx`。
 */
import { useEffect, useState } from 'react'
import { callOp } from '../core/api.ts'
import { noticeWithWarnings, useDomain, type DomainFailure } from '../core/domain.ts'
import { samePath } from '../core/paths.ts'
import { readText, writeText } from '../core/storage.ts'
import type {
  McpStateView,
  PromptState,
  PromptTargetOption,
  SceneDraft,
  SceneRow,
  ScenesStateView,
  SkillRef,
  SkillStateView,
} from '../core/types.ts'
import type { Translate } from '../../i18n/index.ts'

/** 编辑器左侧「可选的技能 / 服务器 / 预设」。 */
export interface DraftSources {
  skills: { root: string; name: string; label: string; rootLabel: string; on: boolean }[]
  servers: { id: string; name: string; on: boolean }[]
  presets: PromptState['presets']
}

export interface SceneUsage {
  workspaces: number
  sessions: number
}

export interface ScenesController {
  state: ScenesStateView | null
  busy: string
  error: DomainFailure | null
  scenes: SceneRow[]
  warnings: string[]
  /** 工作区登记表（宿主给的那一份）。 */
  workspaces: PromptTargetOption[]
  /** 有默认场景的工作区路径，用于顶部徽章。 */
  activeKeys: string[]
  sessionCount: number
  /** 已绑定场景的工作区数 / 登记表总数，折叠时也要能一眼看出。 */
  boundCount: number
  /** 「工作区用哪个场景」这一节的展开状态（本机偏好）。 */
  workspacesOpen: boolean
  toggleWorkspaces(): void
  /** 这个工作区当前选的场景名，没选就是空串。 */
  activeOf(workspacePath: string): string
  sources: DraftSources
  draft: SceneDraft | null
  search: string
  setSearch(value: string): void
  usageOf(scene: SceneRow): SceneUsage
  openNew(): void
  openEdit(scene: SceneRow): void
  changeDraft(patch: Partial<SceneDraft>): void
  cancelDraft(): void
  saveDraft(): void
  remove(scene: SceneRow): void
  setWorkspaceScene(workspacePath: string, scene: string | null): void
}

/** 「工作区用哪个场景」那一节的折叠状态：本机界面偏好，只进 localStorage。 */
const WORKSPACES_KEY = 'tool-center:workspaces-open'

export function useScenes(t: Translate, notify: (message: string) => void): ScenesController {
  const domain = useDomain<ScenesStateView>('scene-state', notify)
  const state = domain.state
  const [skills, setSkills] = useState<SkillStateView | null>(null)
  const [mcp, setMcp] = useState<McpStateView | null>(null)
  const [prompts, setPrompts] = useState<PromptState | null>(null)
  const [targets, setTargets] = useState<PromptTargetOption[]>([])
  const [draft, setDraft] = useState<SceneDraft | null>(null)
  const [search, setSearch] = useState('')
  const [workspacesOpen, setWorkspacesOpen] = useState(true)

  /* 默认展开：第一次进来的人得先看见那张表，才知道要去哪里选。之后记住用户的选择。 */
  useEffect(() => {
    if (readText(WORKSPACES_KEY) === '0') setWorkspacesOpen(false)
  }, [])

  /** 工作区清单来自宿主的工作区登记表（`prompt-targets` 已经把它吐出来了，复用即可）。 */
  useEffect(() => {
    void callOp<{ options: PromptTargetOption[] }>('prompt-targets', {})
      .then((data) => setTargets(data.options ?? []))
      .catch(() => setTargets([]))
  }, [])

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

  const openDraft = (next: SceneDraft): void => {
    setDraft(next)
    void loadSources()
  }

  const workspaceOptions = targets.filter((option) => option.kind === 'workspace')

  /** 路径同一性由宿主定义（大小写 / 分隔符），所以比较也只走 `samePath`。 */
  const activeOf = (workspacePath: string): string => {
    const key = Object.keys(active).find((candidate) => samePath(candidate, workspacePath))
    return key === undefined ? '' : (active[key] ?? '')
  }

  return {
    state,
    busy: domain.busy,
    error: domain.error,
    scenes,
    warnings: state?.warnings ?? [],
    workspaces: workspaceOptions,
    activeKeys: Object.keys(active),
    sessionCount: Object.keys(sessions).length,
    boundCount: workspaceOptions.filter((option) => activeOf(option.path) !== '').length,
    workspacesOpen,
    toggleWorkspaces: () => setWorkspacesOpen((open) => {
      writeText(WORKSPACES_KEY, open ? '0' : '1')
      return !open
    }),
    activeOf,
    sources,
    draft,
    search,
    setSearch,

    /** 这个场景被多少工作区当作默认、被多少会话自己选中。 */
    usageOf: (scene) => ({
      workspaces: Object.values(active).filter((name) => name === scene.name).length,
      sessions: Object.values(sessions).filter((choice) => choice.scene === scene.name).length,
    }),

    openNew: () => openDraft({
      name: '',
      description: '',
      isNew: true,
      skills: [],
      mcp: [],
      prompt: '',
      exclusive: true,
    }),
    openEdit: (scene) => openDraft({
      name: scene.name,
      description: scene.description,
      isNew: false,
      skills: scene.skills.slice(),
      mcp: scene.mcp.slice(),
      prompt: scene.prompt ?? '',
      exclusive: scene.exclusive !== false,
    }),
    changeDraft: (patch) => setDraft((current) => (current === null ? current : { ...current, ...patch })),
    cancelDraft: () => setDraft(null),
    saveDraft: () => {
      if (draft === null) return
      if (draft.name.trim() === '') {
        domain.fail(t('scenes.nameRequired'))
        return
      }
      const skills: SkillRef[] = draft.skills
      void domain.act('scene-save', {
        name: draft.name.trim(),
        description: draft.description,
        skills,
        mcp: draft.mcp,
        prompt: draft.prompt === '' ? null : draft.prompt,
        exclusive: draft.exclusive,
      }, t('common.save')).then((done) => {
        if (done.ok) setDraft(null)
      })
    },
    remove: (scene) => {
      if (!window.confirm(t('scenes.confirmDelete', { name: scene.name }))) return
      void domain.act('scene-delete', { name: scene.name })
    },
    setWorkspaceScene: (workspacePath, scene) => {
      void domain.act(
        'scene-workspace',
        { workspace: workspacePath, scene },
        (result) => noticeWithWarnings(
          scene === null ? t('scenes.workspaceCleared') : t('scenes.workspaceApplied', { name: scene }),
          result,
        ),
      )
    },
  }
}
