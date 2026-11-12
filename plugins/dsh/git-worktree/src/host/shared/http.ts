/** 插件自有路由所需的最小 JSON/HTTP 管道。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DomainError } from './errors.ts'

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/** Client 的 `call()` 唯一认得的失败信封。 */
export function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { ok: false, error: { code, message } })
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127\./.test(hostname)
}

function isSameAuthority(origin: string, host: string): boolean {
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }
  const scheme = originUrl.protocol === 'https:' ? 'https:' : (originUrl.protocol === 'http:' ? 'http:' : null)
  if (scheme === null) return false
  try {
    /* 按 Origin 的协议比较，这样默认端口才能归一化。 */
    return originUrl.host === new URL(scheme + '//' + host).host
  } catch {
    return false
  }
}

function hostnameOf(host: string): string {
  return host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '')
}

/**
 * Host 没有 Connection 服务时的兜底信任栅栏。
 *
 * 载体对具名路由不施加任何认证或 Origin 策略，所以暴露写操作的路由必须自己加一道：
 * 跨站请求一律拒绝；带了 Origin 就必须**既是回环、又精确指向本权威**。
 *
 * 只比 Origin 与 Host 是不够的：攻击者把 evil.com 解析到 127.0.0.1 之后，浏览器发来的
 * `Origin` 与 `Host` 都是 evil.com，两者相等就放行了（DNS rebinding）。回环判定必须在前面。
 *
 * 退一步说，这道栅栏只能算「浏览器跨站防护」，不是本机鉴权：任何本机进程都能自己写
 * `Host: 127.0.0.1` 打这些路由。
 */
export function isTrusted(req: IncomingMessage): boolean {
  const host = header(req, 'host')
  if (host === undefined || host === '') return false
  if (header(req, 'sec-fetch-site') === 'cross-site') return false
  const hostname = hostnameOf(host)
  if (!isLoopbackHostname(hostname)) return false
  const origin = header(req, 'origin')
  if (origin !== undefined) return isSameAuthority(origin, host)
  return true
}

export function readJsonBody(req: IncomingMessage, limit = 1 << 20): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new DomainError('too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw) as unknown
        resolve(parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {})
      } catch {
        reject(new DomainError('bad-json'))
      }
    })
    req.on('error', () => reject(new DomainError('bad-request')))
  })
}
