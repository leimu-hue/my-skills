/**
 * 那一条具名路由的请求处理管道。
 *
 * 具名的 `webServer` 路由拿不到 `/api` 桥自带的任何保护，所以由这个模块补上：
 * 只允许 POST、插件门禁头（跨站页面想带它就得先过 CORS 预检，而这条路由从不回应预检）、
 * 宿主 `connection` 栅栏（存在时），以及回环地址兜底。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export const PLUGIN_ID = 'tool-center'
export const GATE_HEADER = 'x-dsh-plugin'

/** 请求体上限：ZIP 导入走 base64，所以比普通 JSON 宽得多。 */
const MAX_BODY_BYTES = 48 * 1024 * 1024

export interface JsonResponse {
  ok: boolean
  data?: unknown
  error?: string
  code?: string
  params?: Record<string, unknown>
}

export function sendJson(res: ServerResponse, status: number, payload: JsonResponse): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** 读取并解析 JSON 请求体，带硬性大小上限。 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('body is not valid JSON')
  }
}

/** 宿主没有 `connection` 服务时的兜底：只认回环地址。 */
export function isTrusted(req: IncomingMessage): boolean {
  const address = req.socket?.remoteAddress ?? ''
  const loopback = address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.')
  if (!loopback) return false
  const host = String(req.headers.host ?? '')
  if (host !== '') {
    const hostname = host.replace(/:\d+$/, '').toLowerCase()
    if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') return false
  }
  return true
}

/** content-type 可以不传；传了就必须是 JSON。 */
export function wantsJson(req: IncomingMessage): boolean {
  const type = String(req.headers['content-type'] ?? '').toLowerCase()
  return type === '' || type.includes('application/json')
}
