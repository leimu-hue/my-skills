// Host 视图形状在浏览器半侧的镜像。刻意用结构化类型：浏览器半侧不能 import Host 的构建产物
// （模块系统不同），这里的漂移由对着这些声明的 typecheck 抓出来。
export interface EntryPolicy {
  rootOn: boolean
  skillOn: boolean
  modelInvocable: boolean
  userInvocable: boolean
}

export interface SkillRow {
  rootKey: string
  rootLabel: string
  rootRank: number
  rootKind: string
  rootWritable: boolean
  name: string
  declaredName: string
  description: string
  whenToUse?: string
  docPath: string
  entryPath: string
  form: 'bundle' | 'flat'
  loadable: boolean
  problem?: string
  linked: boolean
  nested: boolean
  declaresModelInvocable: boolean
  declaresUserInvocable: boolean
  policy: EntryPolicy
  preferred: boolean
  shadowed: boolean
  winner: boolean
  shadowedBy?: { rootKey: string; rootLabel: string; path: string }
}

/** 一个技能引用（场景白名单与 op 参数同形）。 */
export interface SkillRef {
  root: string
  name: string
}

export interface RootView {
  key: string
  path: string
  label: string
  rank: number
  kind: string
  writable: boolean
  toggleable: boolean
  project: boolean
  hostScans: boolean
  enabled: boolean
  removed: boolean
  skills: SkillRow[]
  error?: string
  truncated?: boolean
}

export interface SkillStateView {
  roots: RootView[]
  counts: { total: number; enabled: number; disabled: number; shadowed: number; sources: number }
  warnings: string[]
  scopeKey: string
  generation: number
  durationMs: number
  stateHealthy: boolean
}

export interface SkillDetail {
  row: SkillRow
  body: string
  files: string[]
  frontmatter: Record<string, unknown>
}

export interface TrashItem {
  id: string
  name: string
  declaredName: string
  rootKey: string
  rootLabel: string
  form: 'bundle' | 'flat'
  deletedAt: number
  originalPath: string
  description: string
}

export interface Health {
  version: string
  provider: string
  statePath: string
  state: { origin: string; degraded: boolean; warnings: string[] } | null
  invalidators: number
}

/* ------------------------- 其它三个域的视图类型 ------------------------- */

export interface PromptPreset {
  name: string
  content: string
  bytes: number
  updatedAt: number
  /** 这份预设的作用范围。 */
  scope: { kind: 'global' | 'workspace'; path: string; label: string }
  /** 是否正在生效。 */
  enabled: boolean
}

export interface PromptTargetOption {
  kind: 'global' | 'workspace'
  label: string
  path: string
}

export interface AppliedTarget {
  key: string
  label: string
  preset: string
  at: number
  agentsPath: string
  drifted: boolean
}

export interface PromptState {
  presets: PromptPreset[]
  /** 当前生效的目标一览（一个目标最多一份预设）。 */
  applied: AppliedTarget[]
  backupCount: number
  warnings: string[]
}

export interface McpServerRow {
  id: string
  name: string
  transport: string
  command: string
  args: string[]
  url: string
  enabled: boolean
  declaredAt: 'user' | 'tool-center'
}

export interface McpStateView {
  servers: McpServerRow[]
  patchPath: string
  patchExists: boolean
  overridden: string[]
  warnings: string[]
  backupCount: number
}

export interface SceneRow {
  name: string
  description: string
  /** 要启用的技能（白名单）。 */
  skills: SkillRef[]
  /** 要保留的 MCP 服务器 id（其余服务器的工具在该场景里被遮掉）。 */
  mcp: string[]
  prompt: string | null
  /** 整套切换：该作用域里未选中的技能挡掉。 */
  exclusive: boolean
  createdAt: number
  updatedAt: number
}

/** 一个会话自己的选择：`scene: null` = 明确不用（压过工作区默认）。 */
export interface SessionChoiceRow {
  scene: string | null
  workspace: string
  at: number
}

export interface ScenesStateView {
  scenes: SceneRow[]
  /** 工作区路径 → 该工作区默认用哪个场景。 */
  active: Record<string, string>
  /** 根会话 id → 这个会话自己的选择。 */
  sessions: Record<string, SessionChoiceRow>
  warnings: string[]
  path: string
}

