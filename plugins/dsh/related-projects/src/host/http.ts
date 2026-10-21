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

/**
 * Loopback authority or a same-origin browser request. `webServer` routes skip
 * the Connection gate entirely, so this is the only thing standing between the
 * registry and any local process that can reach the port.
 */
export function isTrusted(req: IncomingMessage): boolean {
  const host = header(req, 'host')
  if (host === undefined || host === '') return false
  const hostname = host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '')
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return true
  if (/^127\./.test(hostname)) return true
  const site = header(req, 'sec-fetch-site')
  return site === 'same-origin' || site === 'same-site'
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
