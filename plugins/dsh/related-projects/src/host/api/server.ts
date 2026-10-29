/**
 * 具名路由的请求处理：门禁 → JSON 回执。
 *
 * 每个方法是一条**独立的 exact 路由**（`/related-projects/<method>`）。WebServer 的
 * 合约是「具名路由的 (kind, path) 必须互不相同，图案是组合级契约」，一条
 * `prefix` 路由会把整个 `/related-projects` 命名空间占为己有：既挡住别的手写插件
 * 复用同一前缀，也让 404 无法区分「没有这个方法」和「路径拼错」。
 *
 * 顺序是刻意的：
 *   1. 信任门禁（组合提供了 Host 的 `connection` 就用它，否则退回回环地址）；
 *   2. 只允许 POST；
 *   3. 读取 JSON 请求体（有硬上限）并执行。
 *
 * 所有失败都经由 `sendError` 返回，带上一个由 UI 翻译的 `code`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { isTrusted, readJsonBody, sendError, sendJson } from '../shared/http.js'
import { RegistryError } from '../shared/errors.js'
import { connectionOf } from '../shared/context.js'
import type { ConnectionService } from '../shared/types.js'
import type { Handler } from './routes.js'

const ROUTE_BASE = '/related-projects'

/** 一个方法的具名路由路径；注册与 Client 拼 URL 共用这一个函数。 */
export function routePath(method: string): string {
  return ROUTE_BASE + '/' + method
}

/**
 * 供挂载 `webServer` 却没有 `connection` 的 Host 使用的门禁。`connection`
 * 的查找会反复重试直到成功：组合可能在本插件生效之后才提供该服务。
 */
function trustFence(ctx: Context): (req: IncomingMessage) => number | undefined {
  let connection: ConnectionService | undefined
  return (req) => {
    if (connection === undefined) connection = connectionOf(ctx)
    const rejection = connection?.requestRejection
    if (typeof rejection === 'function') {
      try {
        const status = rejection.call(connection, req)
        if (status === undefined || status === null) return undefined
        return typeof status === 'number' ? status : 403
      } catch {
        return 403
      }
    }
    return isTrusted(req) ? undefined : 403
  }
}

export interface RouteHandlerDeps {
  /** Host 上下文，供信任门禁取 `connection`。 */
  ctx: Context
  /** 这条路由承载的方法名，仅用于错误文案。 */
  method: string
  handler: Handler
}

export function createRouteHandler(deps: RouteHandlerDeps) {
  const fence = trustFence(deps.ctx)

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rejection = fence(req)
    if (rejection !== undefined) {
      const unauthorized = rejection === 401
      sendError(res, rejection, unauthorized ? 'unauthorized' : 'forbidden', unauthorized ? 'browser session required' : 'forbidden')
      return
    }
    if (req.method !== 'POST') {
      sendError(res, 405, 'method', 'POST required')
      return
    }
    /* 响应在写完之前就 close，说明是请求方走了（客户端换了两次按键就会这样）。
       中止信号交给处理器，让它们把没人在等的遍历停下来。 */
    const controller = new AbortController()
    res.on('close', () => {
      if (res.writableEnded !== true) controller.abort(new Error('request closed'))
    })
    try {
      const payload = await readJsonBody(req)
      const data = await deps.handler(payload, controller.signal)
      /* 已经中止：连接不在了，写回执没有意义，也不能把 abort 报成 500。 */
      if (controller.signal.aborted) return
      sendJson(res, 200, { ok: true, data })
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof RegistryError) {
        sendError(res, 400, error.code, error.code)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      sendError(res, 500, 'internal', deps.method + ': ' + message)
    }
  }
}
