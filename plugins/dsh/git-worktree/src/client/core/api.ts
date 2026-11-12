/**
 * 唯一的 Client→Host 通道：每方法一条 exact 路由（见 host/api/server.ts）。
 *
 * 相对路径是刻意的：外壳以 `<base href="./">` 提供，重写代理因此仍然可用，
 * 而 `fetch` 解析的也是同一个 base。
 */

const API_BASE = 'git-worktree'

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(message !== undefined && message !== '' ? message : code)
    this.name = 'ApiError'
    this.code = code === '' ? 'generic' : code
  }
}

interface Envelope {
  ok?: boolean
  data?: unknown
  error?: { code?: string; message?: string }
}

async function readEnvelope(response: Response): Promise<Envelope | null> {
  try {
    return await response.json() as Envelope
  } catch {
    return null
  }
}

export async function call<T = Record<string, unknown>>(method: string, payload?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_BASE + '/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload === undefined ? {} : payload),
    })
  } catch (error) {
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  const body = await readEnvelope(response)
  if (body?.ok === true) return body.data as T
  const error = body?.error
  throw new ApiError(
    error?.code !== undefined && error.code !== '' ? error.code : 'http-' + String(response.status),
    error?.message,
  )
}
