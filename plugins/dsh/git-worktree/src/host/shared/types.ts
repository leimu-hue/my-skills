/** 跨 Host / Client 的视图类型：只放 JSON 能表达的东西。 */

/** 检出布局：仓库内 `.worktrees/`，或插件状态目录。 */
export type WorktreeLayout = 'repo' | 'state'

/** 新建检出时是否顺手建分支。 */
export type WorktreeMode = 'branch' | 'detached'

/** 基线从哪里取。 */
export type BasePolicy = 'fresh' | 'head'

/** 谁创建了这个检出：本插件，还是外部 Git。 */
export type WorktreeOrigin = 'managed' | 'external'

export type WorktreeState = 'ready' | 'missing'

export interface RepositoryView {
  /** 主仓根目录（realpath）。会话在 linked worktree 里时，这里仍是主仓。 */
  root: string
  /** 展示名：目录名。 */
  name: string
  /** 主仓当前分支；detached 时为 null。 */
  branch: string | null
  /** 主仓当前 HEAD；空仓库为 null。 */
  headOid: string | null
  /** 远端默认分支名（`origin/HEAD` 解析结果），没有远端时为 null。 */
  defaultBranch: string | null
  /** `git --version` 报告的版本，仅用于诊断。 */
  version?: string
}

/**
 * 隔离探测结果：当前会话目录是否已经处在隔离里。
 *
 * `inWorktree` 已经把 submodule 排除掉了（submodule 里 `GIT_DIR != GIT_COMMON`
 * 同样成立，但那是普通检出），所以 `inWorktree === true` 就可以直接「不要再建」。
 */
export interface IsolationView {
  /** 探测起点：最近活跃会话的目录。 */
  cwd: string | null
  /** 这个目录是 linked worktree（`GIT_DIR != GIT_COMMON`，且不在 submodule 里）。 */
  inWorktree: boolean
  /** 这个目录属于 submodule（`--show-superproject-working-tree` 非空）。 */
  inSubmodule: boolean
  /** 当前目录（worktree 或主仓）。 */
  path: string | null
  /** 当前目录所在分支；detached 为 null。 */
  branch: string | null
  /** 归属主仓。 */
  mainRoot: string | null
}

export interface WorktreeView {
  /** managed 记录用注册表 id；external 用路径派生的稳定 id。 */
  id: string
  name: string
  origin: WorktreeOrigin
  /** 主仓根目录。 */
  repository: string
  repositoryName: string
  /** worktree 目录。 */
  path: string
  /** worktree 当前检出的分支；detached 为 null。 */
  branch: string | null
  /** worktree 当前 HEAD；目录不可读时为 null。 */
  headOid: string | null
  /** 创建方式；external 未知。 */
  mode: WorktreeMode | null
  /** 创建基线（managed 记录下来的值）。 */
  baseOid: string | null
  baseBranch: string | null
  createdAt: number | null
  state: WorktreeState
  /** 未提交/未跟踪的条目数。 */
  dirty: number
  /** 相对基线的净改动文件数（含已提交与未提交）。 */
  files: number
  /** worktree 相对基线新增的提交数。 */
  ahead: number
  /** 基线在创建后前进了多少提交。 */
  behind: number
  /** Git 层 lock（`git worktree lock`）。 */
  locked: boolean
  /** Git 认为元数据可回收（目录被外部删掉）。 */
  prunable: boolean
  /** 已注册成的 DSH 工作区 id（若用户点过「在工作区中打开」）。 */
  workspaceId: string | null
  /** 当前会话目录是不是就落在这个 worktree 里。 */
  current: boolean
}

export interface RepositoryRow {
  root: string
  name: string
  /** 该仓库下本插件管理的 worktree 数。 */
  worktrees: number
}

export interface StateValue {
  repository: RepositoryView | null
  repositories: RepositoryRow[]
  worktrees: WorktreeView[]
  /** 当前会话是否已经在隔离工作区里（面板据此收起创建入口）。 */
  isolation: IsolationView
  /** 本次探测采用的布局，面板用来解释目录位置。 */
  layout: WorktreeLayout
  /**
   * 面板里可编辑的分支前缀；AI 创建检出时用它命名分支。
   *
   * 字段缺省表示 Host 没有返回该设置；Client 据此提示重载插件，
   * 而不是把 undefined 当成空前缀。
   */
  branchPrefix?: string
}

export interface DiffFile {
  path: string
  /** 新增行数；二进制文件为 null。 */
  added: number | null
  removed: number | null
  untracked: boolean
}

export interface DiffValue {
  /** 相对 base 的统一 diff 文本，超过预算时被截断。 */
  patch: string
  truncated: boolean
  files: DiffFile[]
  untracked: string[]
}

export interface ApplyResult {
  applied: true
  /** 主仓工作区里被修改的文件数。 */
  files: number
  /** 快照提交：用 `commit-tree` 造的孤立提交，**不在任何分支上**，只用于取补丁/钉引用。 */
  snapshotOid: string | null
}

/** `.worktreeinclude` 的结果：带进去了什么、跳过了多少。 */
export interface IncludeResult {
  copied: string[]
  skipped: number
}

/** 创建后按配置执行的一条命令（setup 或 verify）。 */
export interface CommandRun {
  kind: 'setup' | 'verify'
  command: string
  ok: boolean
  code: number
  /** 被超时终止（进程树已收尾）；此时 `code` 为 -1。 */
  timedOut: boolean
  /** 截断后的输出（stdout + stderr）。 */
  output: string
}

export interface CreateResult {
  /** false 表示隔离检测判定「已经在隔离里」，没有创建任何东西。 */
  created: boolean
  reason?: 'already-isolated'
  /** 新建的 / 已存在的那个检出；探测失败时为 null。 */
  worktree: WorktreeView | null
  /** 从主仓按 `.worktreeinclude` 带进来的 gitignored 文件。 */
  copied: string[]
  /** include 处理失败时的提示；worktree 仍然创建成功。 */
  includeError?: string
  /** 仓库改写了 `.git/info/exclude`（只在仓库内布局、且原本未忽略时发生）。 */
  ignoreAdded: boolean
  /** 按配置执行的 setup / verify。默认配置下为空。 */
  commands: CommandRun[]
  /** 自动注册成工作区后的 id；没注册或失败为 null。 */
  workspaceId: string | null
  /** 自动新建的会话 id；Host 没有 agent 工厂时为 null。 */
  sessionId: string | null
  /** 自动注册 / 新建会话失败的原因；检出本身仍然创建成功。 */
  sessionError?: string
  /**
   * 任务没能发进新会话的原因；缺省表示没给任务，或给了且已经发出去。
   *
   * 检出与会话都已建成时，一条消息发不进去不足以让整个创建失败——
   * 回执里说明原因，人可以切过去自己说。
   */
  taskError?: string
}

export interface RemoveResult {
  removed: true
  /** 强制删除前留下的快照提交；没有需要抢救的内容时为 null。 */
  archivedOid: string | null
  /** 被删除的 worktree 检出的分支（分支本身保留）。 */
  branch: string | null
}

/** 清理失效残留：记录层（目录已丢失）与 Git 层（可 prune 的元数据）。 */
export interface PruneResult {
  removed: number
  names: string[]
  /** 被 Git 收回的检出目录（含非本插件创建的）。 */
  pruned: string[]
}
