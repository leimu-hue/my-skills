/**
 * 唯一的 Client→Host 通道：一条相对挂载点的 JSON 路由。
 *
 * 相对路径是刻意的：外壳以 `<base href="./">` 提供，重写代理因此仍然可用，
 * 而 `fetch` 解析的也是同一个 base。
 */
import type { WorkspaceHint } from './types.js'

export const API_BASE = 'related-projects/api'

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
  let body: Envelope | null = null
  try {
    body = await response.json() as Envelope
  } catch {
    body = null
  }
  if (body !== null && body.ok === true) return body.data as T
  const code = body !== null && body.error !== undefined ? String(body.error.code ?? '') : ''
  const message = body !== null && body.error !== undefined ? String(body.error.message ?? '') : ''
  throw new ApiError(code === '' ? 'http-' + String(response.status) : code, message)
}

/**
 * 会话级调用的 payload。Client 已经知道该会话目录时，就把目录提示一并带上：
 * 旧会话的 resume 可能还在途中，而 Host 已经能把该路径归并到它注册的工作区，
 * 少了这个提示，那次调用就会被当作 "workspace-missing" 拒绝。
 */
export function sessionPayload(
  sessionId: string,
  hint: WorkspaceHint,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...extra, sessionId }
  const workspace = hint(sessionId)
  if (workspace !== '') payload.workspace = workspace
  return payload
}
