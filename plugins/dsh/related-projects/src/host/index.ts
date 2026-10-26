/**
 * Host 入口：只做接线。
 *
 * 分层（每层知道的越少越好）：
 *   shared/    我们探测的 Cordis 切片、路径身份、视图类型、JSON 管道
 *   registry/  持久化 + 「什么才算关联项目」的规则
 *   prompt/    模型读到的确切文本，以及按会话区分的通道
 *   files/     `@` 菜单背后的文件索引
 *   workspace/ 「我在哪个工作区」和「我能写什么」
 *   api/       那条 JSON 路由、它的处理器，以及面向 agent 的工具
 */
import { spawn } from 'node:child_process'
import { Registry } from './registry/service.js'
import { SessionRegistry } from './prompt/sessions.js'
import { createHandlers } from './api/routes.js'
import { ROUTE_PATH, createRequestHandler } from './api/server.js'
import { createTool } from './api/tools.js'
import type { AgentsService, HostContext, ToolsService, WebServerService } from './shared/context.js'
import type { AgentLike } from './shared/context.js'

export const name = 'related-projects'
export const inject = ['webServer']

interface PluginConfig {
  dataFile?: unknown
}

/** 在操作系统文件管理器里打开目录；失败不是调用方的问题。 */
function openInFileManager(target: string): void {
  const command = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open')
  /* 缺少可执行文件时 spawn 通过 'error' 事件报告，而不是抛错。 */
  const child = spawn(command, [target], { detached: true, stdio: 'ignore' })
  child.on('error', () => { /* 没有值得告知调用方的信息 */ })
  child.unref()
}

export function apply(ctx: HostContext, config?: PluginConfig): void {
  const dataFile = config !== undefined && typeof config.dataFile === 'string' && config.dataFile !== ''
    ? config.dataFile
    : undefined
  const registry = new Registry(dataFile)
  const sessions = new SessionRegistry(ctx, registry)

  installRoute(ctx, registry, sessions)
  installTool(ctx, registry, sessions)
  trackSessions(ctx, sessions)
}

/* --------------------------------- 路由 --------------------------------- */

function installRoute(ctx: HostContext, registry: Registry, sessions: SessionRegistry): void {
  const webServer = ctx.get('webServer') as WebServerService | undefined
  if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') return
  const handler = createRequestHandler({
    ctx,
    handlers: createHandlers({ ctx, registry, sessions, openInFileManager }),
  })
  ctx.effect(() => webServer.register({ kind: 'prefix', path: ROUTE_PATH, handler }), 'related-projects: routes')
}

/* ---------------------------------- 工具 ---------------------------------- */

/**
 * 工具是可选的 —— Host 可能在没有 `tools` 服务的情况下挂载本插件，所以它不在
 * `inject` 里。`inject()` 仍然要紧：否则在 apply 跑完之后才提供 `tools` 的组合
 * 就永远看不到这个工具。
 */
function installTool(ctx: HostContext, registry: Registry, sessions: SessionRegistry): void {
  const register = (scoped: HostContext): void => {
    const tools = scoped.get('tools') as ToolsService | undefined
    if (tools === undefined || tools === null || typeof tools.register !== 'function') return
    scoped.effect(() => tools.register(createTool(scoped, registry, sessions)), 'related-projects: tool')
  }
  if (typeof ctx.inject === 'function') ctx.inject(['tools'], register)
  else register(ctx)
}

/* -------------------------------- 会话 -------------------------------- */

/**
 * 每个活跃会话都会拿到那段固定文本。本插件（重新）加载时已经存在的会话 —— 包括
 * 正在跑这段代码的那个 —— 通过 agents 注册表接管，因为它们的 `agent/created`
 * 事件早就过去了。
 */
function trackSessions(ctx: HostContext, sessions: SessionRegistry): void {
  if (typeof ctx.on === 'function') {
    ctx.on('agent/created', (data) => sessions.attach((data as { agent?: AgentLike })?.agent))
    ctx.on('agent/disposed', (data) => sessions.detach((data as { agent?: AgentLike })?.agent))
  }
  try {
    const agents = ctx.get('agents') as AgentsService | undefined
    const list = agents !== undefined && typeof agents.list === 'function' ? agents.list() : null
    if (list !== null) for (const agent of list) sessions.attach(agent as AgentLike)
  } catch { /* 这个 Host 上没有活 agent 注册表 */ }

  ctx.effect(() => () => sessions.disposeAll(), 'related-projects: session cleanup')
}
