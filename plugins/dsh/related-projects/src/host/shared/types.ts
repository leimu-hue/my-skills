/**
 * Host 半侧的词汇表，集中在一处：
 *
 *   Project     存下来的东西（不查文件系统）
 *   ProjectView 路由、工具和提示词拿到的东西（多一个 `exists`）
 *   Group       一个工作区的全部项目，按折叠后的路径分组
 *   Snapshot    单个工作区给出的答案；`StateValue` 再加上面板的跨工作区视图
 */
import type { IncomingMessage } from 'node:http'

export interface Project {
  id: string
  path: string
  name: string
  /** 这个项目什么时候需要改，自由文本。 */
  note: string
  enabled: boolean
  origin: 'user' | 'agent'
  createdAt: number
}

/** 界面看到的一个项目：存下来的那一行，外加目录是否还在。 */
export interface ProjectView extends Omit<Project, 'createdAt'> {
  exists: boolean
}

export interface Group {
  key: string
  path: string
  updatedAt: number
  projects: Project[]
}

export interface GroupView {
  key: string
  path: string
  updatedAt: number
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

/** 一次请求涉及的工作区。已知时 `path` 用登记表里的写法。 */
export interface WorkspaceRef {
  key: string
  path: string
}

/** 管理面板的一节：一个 DSH 工作区，登记与否都算。 */
export interface WorkspaceRow {
  key: string
  path: string
  title: string | null
  /** 当这个分组比 DSH 已不再列出的工作区活得更久时为 false。 */
  registered: boolean
  projects: ProjectView[]
}

/** 单个工作区给出的答案：输入框那一行需要的东西，仅此而已。 */
export interface Snapshot {
  settings: Settings
  workspace: WorkspaceRef | null
  projects: ProjectView[]
  limits: Limits
}

/** 面板给出的答案：同上，再加上 DSH 知道的所有工作区。 */
export interface StateValue extends Snapshot {
  groups: GroupView[]
  workspaces: WorkspaceRow[]
}

/** 错误码：路由把它们翻成 HTTP 失败，界面把它们翻成文案。 */
export type RegistryErrorCode =
  | 'not-directory'
  | 'root'
  | 'home'
  | 'self'
  | 'limit'
  | 'no-group'
  | 'outside-project'
  | 'no-project'
  | 'workspace-missing'
  | 'bad-json'
  | 'too-large'
  | 'transport'
  | 'pick-unavailable'
  | 'internal'

/**
 * Host 的 `connection` 服务：`requestRejection()` 施加与内置 `/api` 桥相同的
 * Host/Origin 校验和浏览器会话认证。具名的 `webServer` 路由不会自动获得这些。
 */
export interface ConnectionService {
  requestRejection?(request: IncomingMessage): number | null | undefined
}

/** 关联项目里的一个文件或目录，按 Host 搜索时的原始样子。 */
export interface FileHit {
  /** 绝对路径，插入提及时用它。 */
  path: string
  /** 相对项目根目录的路径，用 `/` 分隔，用于显示和排序。 */
  rel: string
  name: string
  kind: 'file' | 'directory'
  /** 它属于哪个关联项目（显示名）：两个项目里可能有同一条相对路径，行上必须看得出区别。 */
  project: string
}
