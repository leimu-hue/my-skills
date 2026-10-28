// Host 半侧共享的类型定义。集中在一个地方，是为了让所有模块共用同一套词汇：
//   root   = 一个被扫描的技能目录
//   entry  = 磁盘上扫到的一条技能
//   row    = 解析过策略、并裁决过同名归属之后的 entry
//   policy = provider 与面板共同消费的那份答案

/** 一个技能来源：扫描器遍历的目录。 */
export interface SkillRoot {
  /** 稳定键：写进状态文件，也是所有 op 里用的那个键。 */
  key: string
  /** 目录绝对路径。目录可以不存在（来源仍然列出）。 */
  path: string
  /** 越小越优先：既决定同名冲突，也决定能否压过别的 provider 的条目。 */
  rank: number
  /** 给人看的名字，也是界面上的分组标题。 */
  label: string
  kind: 'project-dsh' | 'project-agents' | 'import' | 'local' | 'agents' | 'claude' | 'codex' | 'custom' | 'host'
  /** 本插件是否允许在这个目录里写 / 删技能文件。 */
  writable: boolean
  /** 这个来源能否整体停用。 */
  toggleable: boolean
  /** 是否由会话 cwd 推导出来的项目来源。 */
  project?: boolean
  /**
   * 宿主自己的 filesystem provider 是否也在扫这个目录。
   *
   * `false`：这里的每条技能都得靠我们的候选才能存在；
   * `true`：宿主已经在发布它们，我们只在需要改策略时插手。
   */
  hostScans: boolean
}

/** 磁盘上扫到的一条技能。 */
export interface SkillEntry {
  /** bundle 取目录名，平铺 `.md` 取文件名（去后缀）。 */
  name: string
  /** frontmatter 里的 `name`，缺失时退回 `name`。 */
  declaredName: string
  description: string
  whenToUse?: string
  /** SKILL.md（bundle）或那个 `.md` 文件（flat）的绝对路径。 */
  docPath: string
  /** bundle 的目录；flat 时是它所在目录。 */
  entryPath: string
  form: 'bundle' | 'flat'
  /** 技能自己声明的调用开关（尚未叠加本插件的开关）。 */
  declaresModelInvocable: boolean
  declaresUserInvocable: boolean
  /** 缺少合法 frontmatter、或结构不完整时为 false。 */
  loadable: boolean
  /** 为什么加载不了。面板会显示它，绝不静默丢弃。 */
  problem?: string
  /** 该条目是符号链接 / junction。 */
  linked: boolean
  /** 比宿主「只看顶层」的发现更深，因此只能靠我们的覆盖候选存在。 */
  nested: boolean
}

/** 一条技能最终生效的策略。 */
export interface EntryPolicy {
  /** 只看来源闸（来源开着，且没被「不再读取」）。 */
  rootOn: boolean
  /** 只看这一条的开关，不管来源闸。 */
  skillOn: boolean
  /** 对模型生效的最终开关。 */
  modelInvocable: boolean
  /** 对人工 / `/` 生效的最终开关。 */
  userInvocable: boolean
}

/** 一条技能：策略已解析，同名归属也已裁决。 */
export interface SkillRow {
  rootKey: string
  rootLabel: string
  rootRank: number
  rootKind: SkillRoot['kind']
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
  /** 用户是否把这个名字钉在了这个来源上。 */
  preferred: boolean
  /**
   * 这一行的 provider 候选该带的 rank。
   *
   * 它按**同名组**算，而不是按来源算：被钉住的那份可能来自一个 rank 更高的来源，
   * 若沿用「来源 rank − 1」，它就会输给宿主发布的低 rank 条目，于是「设为首选」
   * 静默失效。所以赢家取「全组最优 rank − 1」；落选者根本不会发候选。
   */
  overlayRank: number
  /** 是否输掉了同名冲突。 */
  shadowed: boolean
  /** 是否赢（`shadowed` 的反面）。 */
  winner: boolean
  /** 输给谁（仅 shadowed 时有值）。 */
  shadowedBy?: { rootKey: string; rootLabel: string; path: string }
}

/** 状态文件：一份 JSON、一次原子写，没有第二个侧车。 */
export interface SkillManagerState {
  version: 1
  /** 来源键 → 是否启用。缺省即启用（默认来源不落这个字段）。 */
  sources: Record<string, boolean>
  /** 用户要求「不再读取」的来源（可恢复，文件一个字节不动）。 */
  removedSources: string[]
  /** 来源键 → 被用户关掉的技能名。 */
  hiddenSkills: Record<string, string[]>
  /** 技能声明名 → 同名冲突里应该胜出的来源键。 */
  preferredSkills: Record<string, string>
  /** 用户添加的来源，各自带 rank。 */
  customRoots: CustomRoot[]
  /** 来源键 → rank 覆盖值。rank 是**数据**，不是代码里的常量。 */
  ranks: Record<string, number>
  /**
   * 预留：按作用域的覆盖。v0.1 只写全局层，但所有策略读取都走 `resolveLayer()`，
   * 所以以后补上这里时，消费方一行都不用改。
   */
  layers: { sessions: Record<string, SkillLayer>; workspaces: Record<string, SkillLayer> }
}

export interface CustomRoot {
  key: string
  path: string
  label: string
  rank: number
}

/** 一个作用域（会话或工作区）可以覆盖的那部分状态。 */
export interface SkillLayer {
  sources?: Record<string, boolean>
  hiddenSkills?: Record<string, string[]>
  /**
   * 在这个作用域里**强制打开**的技能。
   *
   * 只有 `hiddenSkills` 是不够的：场景要能「在这个工作区用一条你平时关着的技能」，
   * 而全局的关是一条隐藏记录，作用域层再隐藏也不改变它。这一层是正向覆盖，
   * 优先级高于同层的 `hiddenSkills`（两者同时出现时以打开为准）。
   */
  enabledSkills?: Record<string, string[]>
  /**
   * 白名单模式：这个作用域里**只留** `enabledSkills` 列出的技能，其余一律不可见。
   *
   * 场景的「整套切换」用它，而不是把未选中的名字逐条写进 `hiddenSkills`：
   * 逐条写等于给场景拍一张快照，之后新装的技能会悄悄漏进场景；白名单是规则，不是快照。
   */
  whitelist?: boolean
  preferredSkills?: Record<string, string>
}

/** 状态文档是从哪里读来的 —— 让界面能如实说明「降级了」。 */
export interface StateLoad {
  state: SkillManagerState
  /** `default` = 文件还不存在（首次运行，正常）。 */
  origin: 'file' | 'default' | 'recovered'
  /** 值得显示在面板上的非致命问题。 */
  warnings: string[]
  /** 文件存在但用不了（已备份）时为 true。 */
  degraded: boolean
}

/** 面板视角下的一个来源。 */
export interface RootView {
  key: string
  path: string
  label: string
  rank: number
  kind: SkillRoot['kind']
  writable: boolean
  toggleable: boolean
  project: boolean
  hostScans: boolean
  enabled: boolean
  removed: boolean
  skills: SkillRow[]
  /** 读这个来源失败（权限等）时有值。 */
  error?: string
  truncated?: boolean
}

export interface SkillStateView {
  roots: RootView[]
  counts: { total: number; enabled: number; disabled: number; shadowed: number; sources: number }
  warnings: string[]
  /** 这份视图是按哪个作用域层解析的（'' = 全局）。 */
  scopeKey: string
  /** 扫描代号：每次失效都 +1。 */
  generation: number
  /** 产出这份视图那次读取的实际耗时。 */
  durationMs: number
  /** 状态文档是从好文件读来的，则为 false（已降级）。 */
  stateHealthy: boolean
}

/** 一个技能引用（跨域共用：场景与 op 参数都是这个形状）。 */
export interface SkillRef {
  root: string
  name: string
}
