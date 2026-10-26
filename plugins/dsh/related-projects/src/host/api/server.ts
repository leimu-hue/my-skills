/**
 * 具名路由的请求处理：门禁 → 方法分发 → JSON 回执。
 *
 * 这个顺序是刻意的：
 *   1. 信任门禁（组合提供了 Host 的 `connection` 就用它，否则退回回环地址）；
 *   2. 只允许 POST；
 *   3. 一个路径段给出方法名，在处理器表中查找；
 *   4. 读取 JSON 请求体（有硬上限）并执行。
 *
 * 所有失败都经由 `sendError` 返回，带上一个由 UI 翻译的 `code`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isTrusted, readJsonBody, sendError, sendJson } from '../shared/http.js'
import { RegistryError } from '../shared/errors.js'
import { connectionService } from '../shared/context.js'
import type { HostContext } from '../shared/context.js'
import type { ConnectionService } from '../shared/types.js'
import type { Handler } from './routes.js'

export const ROUTE_PATH = '/related-projects/api'

/**
 * 供挂载 `webServer` 却没有 `connection` 的 Host 使用的门禁。`connection`
 * 的查找会反复重试直到成功：组合可能在本插件生效之后才提供该服务。
 */
function trustFence(ctx: HostContext): (req: IncomingMessage) => number | undefined {
  let connection: ConnectionService | undefined
  return (req) => {
    if (connection === undefined) connection = connectionService(ctx)
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

function methodOf(url: string | undefined): string {
  const pathname = new URL(url === undefined || url === '' ? '/' : url, 'http://dsh.internal').pathname
  if (!pathname.startsWith(ROUTE_PATH + '/')) return ''
  const method = pathname.slice(ROUTE_PATH.length + 1)
  return method.includes('/') ? '' : method
}

export interface RequestHandlerDeps {
  handlers: Record<string, Handler>
  /** Host 的 `connection` 服务访问器，供信任门禁使用。 */
  ctx: HostContext
}

export function createRequestHandler(deps: RequestHandlerDeps) {
  const { handlers } = deps
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
    const method = methodOf(req.url)
    const handler = method !== '' && Object.prototype.hasOwnProperty.call(handlers, method) ? handlers[method] : undefined
    if (handler === undefined) {
      sendError(res, 404, 'not-found', 'unknown method ' + method)
      return
    }
    try {
      const payload = await readJsonBody(req)
      sendJson(res, 200, { ok: true, data: await handler(payload) })
    } catch (error) {
      if (error instanceof RegistryError) {
        sendError(res, 400, error.code, error.code)
        return
      }
      sendError(res, 500, 'internal', error instanceof Error ? error.message : String(error))
    }
  }
}
