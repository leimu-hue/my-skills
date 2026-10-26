/**
 * Host 的视图形状，为浏览器半侧做的镜像。
 *
 * 刻意结构化重复：浏览器半侧不能 import Host 的构建产物（模块系统不同），
 * 所以漂移是靠两半各自对着路由实际发出的 payload 做 typecheck 来抓的。
 * 本文件应当与 `src/host/shared/types.ts` 保持同步。
 */

export interface ProjectView {
  id: string
  path: string
  name: string
  note: string
  enabled: boolean
  origin: 'user' | 'agent'
  exists: boolean
}

export interface GroupView {
  key: string
  path: string
  updatedAt: number
  projects: ProjectView[]
}

export interface WorkspaceRow {
  key: string
  path: string
  title: string | null
  registered: boolean
  projects: ProjectView[]
}

export interface Settings {
  alwaysShowDock: boolean
}

export interface Limits {
  max: number
  noteMax: number
  nameMax: number
}

export interface WorkspaceRef {
  key: string
  path: string
}

/** 一个工作区给出的答案，外加面板的跨工作区列表。 */
export interface StateValue {
  settings: Settings
  workspace: WorkspaceRef | null
  projects: ProjectView[]
  groups: GroupView[]
  workspaces: WorkspaceRow[]
  limits: Limits
}

/** 关联项目里的一个文件或目录，按 Host 搜到的样子。 */
export interface FileHit {
  path: string
  rel: string
  name: string
  kind: 'file' | 'directory'
}

/** Client 已经知道的会话目录；未知时为 ''。 */
export type WorkspaceHint = (sessionId: string) => string

/**
 * 在 Host 首次应答之前使用。这些数字镜像 Host 的限制；只有 `noteMax` 和
 * `max` 会被读到，且只在第一份快照到达之前。
 */
export const DEFAULT_LIMITS: Limits = { max: 10, noteMax: 200, nameMax: 60 }
