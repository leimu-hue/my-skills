/**
 * Host 入口：只做接线。
 *
 * 分层（每层知道的越少越好）：
 *   shared/   错误码、JSON 管道、路径与名称规则、跨端视图类型、命令执行器
 *   git/      子进程执行器、仓库与隔离探测、worktree 的增删查与补丁应用
 *   worktree/ 注册表 + 生命周期编排（隔离检测、串行锁、短缓存、当前仓库选择）
 *   api/      具名路由与工具（读 + 创建）
 *   commands/ 面向人的 `/worktree`
 *
 * 生命周期全部由 worktree/ 拥有：创建方式可选分支，目录默认落在仓库内，
 * 列表以 `git worktree list` 为事实来源，外部创建的检出只读展示。
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { createHandlers } from './api/routes.ts'
import { installRoutes } from './api/server.ts'
import { createTools } from './api/tools.ts'
import { createWorktreeCommand } from './commands/worktree.ts'
import { DEFAULT_WORKTREE_DIR, normalizeWorktreeDir } from './shared/paths.ts'
import type { BasePolicy, WorktreeLayout, WorktreeMode } from './shared/types.ts'
import { openInFileManager, WorktreeService } from './worktree/service.ts'

export const name = 'git-worktree'

/** 路由靠 `webServer` 承载，是硬依赖；`tools` / `commands` / `sessions` 一律降级。 */
export const inject = ['webServer']

export interface Config {
  /** 插件状态目录的 `DSH_HOME`；缺省读环境变量，再缺省 `~/.dsh`。 */
  dshHome?: string
  /** `repo`：检出放在仓库内；`state`：放在插件状态目录。 */
  layout?: WorktreeLayout
  /** `repo` 布局下的目录名，默认 `.worktrees`。 */
  worktreeDir?: string
  /** `fresh`：从远端默认分支起；`head`：从主仓当前 HEAD 起。 */
  basePolicy?: BasePolicy
  /** 默认创建方式：`branch` 建分支（可 PR），`detached` 可丢弃（配合 apply）。 */
  mode?: WorktreeMode
  /** 创建后在新检出里依次执行的命令；失败只报告，不撤销检出。 */
  setupCommands?: string[]
  /** 创建后执行的基线自检（如 `npm test`）；只在显式配置时运行。 */
  verifyCommand?: string
  /** setup / verify 的单条超时（毫秒）。 */
  setupTimeoutMs?: number
  /** 创建后自动把检出注册成工作区（侧栏可见），默认开。 */
  autoRegisterWorkspace?: boolean
  /** 创建后自动在该检出里新建一个会话，默认开。 */
  autoSession?: boolean
  /** 普通 git 命令的超时（毫秒）。 */
  gitTimeoutMs?: number
  /** 检出整棵工作区的超时（毫秒），大仓库需要更长时间。 */
  worktreeAddTimeoutMs?: number
}

const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 3_600_000

export const Config: Schema<Config> = Schema.object({
  dshHome: Schema.string().description('插件状态目录的 DSH_HOME；缺省 $DSH_HOME 或 ~/.dsh'),
  layout: Schema.union(['repo', 'state']).default('repo')
    .description('检出布局：repo = 仓库内目录；state = 插件状态目录'),
  worktreeDir: Schema.string().default(DEFAULT_WORKTREE_DIR)
    .description('repo 布局下的目录名（相对仓库根）'),
  basePolicy: Schema.union(['fresh', 'head']).default('fresh')
    .description('基线：fresh = 远端默认分支；head = 主仓当前 HEAD'),
  mode: Schema.union(['branch', 'detached']).default('branch')
    .description('默认创建方式：branch 建 worktree/<name>；detached 不建分支'),
  setupCommands: Schema.array(Schema.string()).default([])
    .description('创建后在新检出里依次执行的 setup 命令'),
  verifyCommand: Schema.string()
    .description('创建后执行的基线自检命令，例如 npm test'),
  setupTimeoutMs: Schema.number().step(1).min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(600_000)
    .description('setup / verify 单条命令的超时（毫秒）'),
  autoRegisterWorkspace: Schema.boolean().default(true)
    .description('创建后自动把检出注册成工作区'),
  autoSession: Schema.boolean().default(true)
    .description('创建后自动在该检出里新建一个会话'),
  gitTimeoutMs: Schema.number().step(1).min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(120_000)
    .description('普通 git 命令的超时（毫秒）'),
  worktreeAddTimeoutMs: Schema.number().step(1).min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(600_000)
    .description('创建 worktree 时全量检出的超时（毫秒）'),
})

function bounded(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_TIMEOUT_MS && value <= MAX_TIMEOUT_MS
    ? value
    : fallback
}

function resolveHome(config: Config): string {
  const explicit = config.dshHome?.trim()
  if (explicit !== undefined && explicit !== '') return resolve(explicit)
  const environment = process.env.DSH_HOME?.trim()
  return environment !== undefined && environment !== '' ? resolve(environment) : join(homedir(), '.dsh')
}

/** 配置里的目录名不合法时退回默认值：一个坏配置不该让插件加载失败。 */
function safeDirectory(value: unknown): string {
  try {
    return normalizeWorktreeDir(value)
  } catch {
    return DEFAULT_WORKTREE_DIR
  }
}

interface SessionsLike {
  list?(): Array<{ header?: { cwd?: unknown } }>
}

/**
 * 「当前仓库」的推断依据：最近活跃会话的目录。
 *
 * 面板本身没有会话上下文（它是左侧栏的 keyed 页面），而 worktree 归属仓库而不是
 * 会话。用最近一个还在内存里的会话目录，用户打开面板看到的通常就是刚才那个项目；
 * 解析失败时服务会退回注册表里的仓库，再退回「没有仓库」。
 */
function recentWorkspace(ctx: Context): string | undefined {
  const sessions = ctx.get('sessions') as SessionsLike | undefined
  if (sessions === undefined || typeof sessions.list !== 'function') return undefined
  try {
    const list = sessions.list()
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const cwd = list[index]?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
    }
  } catch {
    /* 探测失败只是拿不到默认仓库。 */
  }
  return undefined
}

interface Registration {
  register(definition: unknown): () => void
}

export function apply(ctx: Context, config: Config = {}): void {
  const service = new WorktreeService(ctx, {
    stateDir: join(resolveHome(config), 'git-worktree'),
    gitTimeoutMs: bounded(config.gitTimeoutMs, 120_000),
    worktreeAddTimeoutMs: bounded(config.worktreeAddTimeoutMs, 600_000),
    layout: config.layout === 'state' ? 'state' : 'repo',
    worktreeDir: safeDirectory(config.worktreeDir),
    basePolicy: config.basePolicy === 'head' ? 'head' : 'fresh',
    mode: config.mode === 'detached' ? 'detached' : 'branch',
    setupCommands: Array.isArray(config.setupCommands)
      ? config.setupCommands.filter((command): command is string => typeof command === 'string' && command.trim() !== '')
      : [],
    verifyCommand: typeof config.verifyCommand === 'string' && config.verifyCommand.trim() !== ''
      ? config.verifyCommand.trim()
      : null,
    setupTimeoutMs: bounded(config.setupTimeoutMs, 600_000),
    autoRegisterWorkspace: config.autoRegisterWorkspace !== false,
    autoSession: config.autoSession !== false,
    recentWorkspace: () => recentWorkspace(ctx),
    openPath: openInFileManager,
  })

  installRoutes(ctx, createHandlers({ service }))

  /* 工具与命令都不是必需依赖：UI-less 组合没有它们，插件仍应能加载。 */
  const tools = createTools(service, service.gitTimeout)
  ctx.inject(['tools'], (scope) => {
    const registry = scope.get('tools') as Registration | undefined
    if (registry === undefined || typeof registry.register !== 'function') return
    for (const tool of tools) {
      const dispose = registry.register(tool)
      if (typeof dispose === 'function') {
        scope.effect(() => dispose, 'git-worktree: tool ' + tool.name)
      }
    }
  })

  const command = createWorktreeCommand(service, service.gitTimeout)
  ctx.inject(['commands'], (scope) => {
    const registry = scope.get('commands') as Registration | undefined
    if (registry === undefined || typeof registry.register !== 'function') return
    const dispose = registry.register(command)
    if (typeof dispose === 'function') {
      scope.effect(() => dispose, 'git-worktree: /worktree')
    }
  })
}
