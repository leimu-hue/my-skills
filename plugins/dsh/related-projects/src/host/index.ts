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

export const name = 'related-projects'

/**
 * 两个都是硬依赖：路由靠 `webServer` 承载，工具靠 `tools` 注册。
 * 其余服务（`sessions` / `sandboxPolicy` / `workspaceRegistry` /
 * `directoryPicker` / `systemPrompt` / `agents`）都是可选的，
 * 一律 `ctx.get(name)` 探测、缺失即降级。
 */
export const inject = ['webServer', 'tools']

export interface Config {
  /** 注册表文件；缺省写到 `$DSH_HOME/related-projects.json`。 */
  dataFile?: string
}

export const Config: Schema<Config> = Schema.object({
  dataFile: Schema.string().description('注册表文件；缺省写到 $DSH_HOME/related-projects.json'),
})

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

  installRoutes(ctx, registry, sessions)
  /* `tools.register()` 自己把 disposer 挂到调用它的上下文上。 */
  ctx.tools.register(createTool(ctx, registry, sessions))
  trackSessions(ctx, sessions)
}

/* --------------------------------- 路由 --------------------------------- */

/**
 * 一个方法一条 exact 路由。`webServer.register()` 只是把路由塞进表里，
 * 不接管生命周期，所以必须由 `ctx.effect()` 回收——否则重载插件会撞上
 * 「duplicate exact route」。
 */
function installRoutes(ctx: Context, registry: Registry, sessions: SessionRegistry): void {
  const webServer: WebServer = ctx.webServer
  const handlers = createHandlers({ ctx, registry, sessions, openInFileManager })
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
