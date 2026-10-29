/**
 * Host 入口：只做接线。
 *
 * 分层（每层知道的越少越好）：
 *   shared/    路径身份、视图类型、JSON 管道、`connection` 的小补充
 *   registry/  持久化 + 「什么才算关联项目」的规则
 *   prompt/    模型读到的确切文本，以及按会话区分的通道
 *   files/     `@` 菜单背后的文件索引
 *   workspace/ 「我在哪个工作区」和「我能写什么」
 *   api/       那些具名路由、它们的处理器，以及面向 agent 的工具
 */
import { spawn } from 'node:child_process'
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { Registry } from './registry/service.js'
import { SessionRegistry } from './prompt/sessions.js'
import { createHandlers } from './api/routes.js'
import { createRouteHandler, routePath } from './api/server.js'
import { createTool } from './api/tools.js'
import {
  DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES,
  DEFAULT_FILE_SEARCH_MAX_ENTRIES,
  DEFAULT_FILE_SEARCH_MAX_RESULTS,
  FileSearch,
} from './files/service.js'
import type { FileSearchConfig } from './files/service.js'

export const name = 'related-projects'

/**
 * 两个都是硬依赖：路由靠 `webServer` 承载，工具靠 `tools` 注册。
 * 其余服务（`sessions` / `sandboxPolicy` / `workspaceRegistry` /
 * `directoryPicker` / `systemPrompt` / `agents`）都是可选的，
 * 一律 `ctx.get(name)` 探测、缺失即降级。
 */
export const inject = ['webServer', 'tools']

/** `@` 菜单文件搜索的预算与排除清单。 */
export interface FileSearchOptions {
  maxResults?: number
  maxEntries?: number
  excludedDirectories?: string[]
}

export interface Config {
  /** 注册表文件；缺省写到 `$DSH_HOME/related-projects/settings.json`。 */
  dataFile?: string
  /** `@` 菜单的文件搜索；缺省即与 DSH 自带的文件补全一致。 */
  fileSearch?: FileSearchOptions
}

export const Config: Schema<Config> = Schema.object({
  dataFile: Schema.string().description('注册表文件；缺省写到 $DSH_HOME/related-projects/settings.json'),
  fileSearch: Schema.object({
    maxResults: Schema.number().step(1).min(1).default(DEFAULT_FILE_SEARCH_MAX_RESULTS)
      .description('一次查询最多返回的行数'),
    maxEntries: Schema.number().step(1).min(1).default(DEFAULT_FILE_SEARCH_MAX_ENTRIES)
      .description('一个项目最多索引多少条目；唯一的预算，没有深度上限'),
    excludedDirectories: Schema.array(Schema.string()).default([...DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES])
      .description('永不遍历的目录名（basename）'),
  }).description('@ 菜单文件搜索的预算与排除清单'),
})

function fileSearchConfigOf(options: FileSearchOptions | undefined): FileSearchConfig {
  return {
    maxResults: options?.maxResults ?? DEFAULT_FILE_SEARCH_MAX_RESULTS,
    maxEntries: options?.maxEntries ?? DEFAULT_FILE_SEARCH_MAX_ENTRIES,
    excludedDirectories: options?.excludedDirectories ?? DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES,
  }
}

/** 在操作系统文件管理器里打开目录；失败不是调用方的问题。 */
function openInFileManager(target: string): void {
  const command = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open')
  /* 缺少可执行文件时 spawn 通过 'error' 事件报告，而不是抛错。 */
  const child = spawn(command, [target], { detached: true, stdio: 'ignore' })
  child.on('error', () => { /* 没有值得告知调用方的信息 */ })
  child.unref()
}

export function apply(ctx: Context, config: Config): void {
  const registry = new Registry(config?.dataFile)
  const sessions = new SessionRegistry(ctx, registry)
  const files = new FileSearch(fileSearchConfigOf(config?.fileSearch))

  installRoutes(ctx, registry, sessions, files)
  /* `tools.register()` 自己把 disposer 挂到调用它的上下文上。 */
  ctx.tools.register(createTool(ctx, registry, sessions))
  trackSessions(ctx, sessions)
  trackFileChanges(ctx, files)
}

/* --------------------------------- 路由 --------------------------------- */

/**
 * 一个方法一条 exact 路由。`webServer.register()` 只是把路由塞进表里，
 * 不接管生命周期，所以必须由 `ctx.effect()` 回收——否则重载插件会撞上
 * 「duplicate exact route」。
 */
function installRoutes(ctx: Context, registry: Registry, sessions: SessionRegistry, files: FileSearch): void {
  const webServer: WebServer = ctx.webServer
  const handlers = createHandlers({ ctx, registry, sessions, files, openInFileManager })
  for (const [method, handler] of Object.entries(handlers)) {
    const serve = createRouteHandler({ ctx, method, handler })
    ctx.effect(
      () => webServer.register({ kind: 'exact', path: routePath(method), handler: serve }),
      'related-projects: route ' + method,
    )
  }
}

/* -------------------------------- 会话 -------------------------------- */

/**
 * 每个活跃会话都会拿到那段固定文本。本插件（重新）加载时已经存在的会话 —— 包括
 * 正在跑这段代码的那个 —— 通过 agents 注册表接管，因为它们的 `agent/created`
 * 事件早就过去了。
 */
function trackSessions(ctx: Context, sessions: SessionRegistry): void {
  ctx.on('agent/created', (payload) => {
    sessions.attach(payload.agent)
    return undefined
  })
  ctx.on('agent/disposed', (payload) => {
    sessions.detach(payload.agent)
  })
  try {
    const agents = ctx.get('agents')
    if (agents !== undefined) for (const agent of agents.list()) sessions.attach(agent)
  } catch { /* 这个 Host 上没有活 agent 注册表 */ }

  ctx.effect(() => () => sessions.disposeAll(), 'related-projects: session cleanup')
}

/* ------------------------------ 文件索引 ------------------------------ */

/** `session/event` 的载荷里只有事件类型对本插件有意义。 */
interface SessionEventLike {
  type: string
}

/**
 * 索引失效：任何工具结果都可能改过关联项目里的文件，而菜单只有路径、
 * 没有别的新鲜度来源。与自带的文件补全同一策略——只标记过期，下一次裸查询
 * 先用旧条目作答，重建在后台进行（见 files/service.ts 的 `indexFor`）。
 *
 * `session/event` 由 `dsh-session` 声明；事件名用字符串转接，好让本插件在
 * 没有这个服务的 Host 上也能加载。
 */
function trackFileChanges(ctx: Context, files: FileSearch): void {
  const listen = ctx.on.bind(ctx) as unknown as (
    name: string,
    listener: (session: unknown, event: SessionEventLike) => void,
  ) => void
  listen('session/event', (_session, event) => {
    if (event.type !== 'tool/result') return
    files.invalidate()
  })
  ctx.effect(() => () => files.dispose(), 'related-projects: file search cache')
}
