/**
 * 唯一的 Client→Host 通道：每方法一条 exact 路由（见 host/api/server.ts）。
 *
 * 相对路径是刻意的：外壳以 `<base href="./">` 提供，重写代理因此仍然可用，
 * 而 `fetch` 解析的也是同一个 base。
 */

const API_BASE = 'related-projects'

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

/** 宿主没回 JSON（代理 502、连接被掐）时返回 null，由调用方按状态码报错。 */
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

/**
 * 系统目录选择器：用户取消时返回 null，宿主没提供选择器时抛 `pick-unavailable`
 * （由调用方统一走 `describeError`）。两个入口共用这一份。
 */
export async function pickDirectoryPath(): Promise<string | null> {
  const result = await call<{ path?: string }>('pick')
  return result.path === undefined || result.path === '' ? null : result.path
}

/**
 * 会话级调用的 payload：会话 id 是 Host 解析工作区的唯一依据（`header.cwd`），
 * Client 不替它猜目录。
 */
export function sessionPayload(
  sessionId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...extra, sessionId }
}
