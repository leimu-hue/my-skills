/** Minimal JSON-over-HTTP plumbing for the plugin-owned route. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { RegistryError } from './store.js'

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127\./.test(hostname)
}

function authorityOf(host: string, scheme: 'http:' | 'https:'): URL | undefined {
  try { return new URL(scheme + '//' + host) } catch { return undefined }
}

/** Compare Host under the Origin's scheme, so default ports normalize. */
function isSameAuthority(origin: string, host: string): boolean {
  let originUrl: URL
  try { originUrl = new URL(origin) } catch { return false }
  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false
  const hostUrl = authorityOf(host, originUrl.protocol === 'https:' ? 'https:' : 'http:')
  return hostUrl !== undefined && originUrl.host === hostUrl.host
}

/**
 * Fallback trust fence for a Host without the Connection service. The carrier
 * applies no authentication or Origin policy to named routes (see
 * docs/subsystems/web-server.md), so a route that exposes mutations has to
 * apply one. This mirrors the documented browser fence: a cross-site request is
 * refused, an attached Origin must name this exact authority, and without a
 * browser Origin only loopback callers are accepted.
 *
 * The shipped Web composition mounts `ctx.connection`, whose
 * `requestRejection()` is authoritative (Host/Origin plus browser
 * authentication); this function is only the fallback.
 */
export function isTrusted(req: IncomingMessage): boolean {
  const host = header(req, 'host')
  if (host === undefined || host === '') return false
  if (header(req, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(req, 'origin')
  if (origin !== undefined) return isSameAuthority(origin, host)
  const hostname = host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '')
  return isLoopbackHostname(hostname)
}

export function readJsonBody(req: IncomingMessage, limit = 1 << 20): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new RegistryError('too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') { resolve({}); return }
      try {
        const parsed = JSON.parse(raw) as unknown
        resolve(parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {})
      } catch {
        reject(new RegistryError('bad-json'))
      }
    })
    req.on('error', () => reject(new RegistryError('transport')))
  })
}
