/**
 * The only Client→Host channel: one mount-relative JSON route.
 *
 * Relative on purpose: the shell is served with `<base href="./">`, so a rewrite
 * proxy keeps working, and `fetch` resolves against that same base.
 */
export const API_BASE = 'related-projects/api'

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message?: string) {
    super(message !== undefined && message !== '' ? message : code)
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
  try { body = await response.json() as Envelope } catch { body = null }
  if (body !== null && body.ok === true) return body.data as T
  const code = body !== null && body.error !== undefined ? String(body.error.code ?? '') : ''
  const message = body !== null && body.error !== undefined ? String(body.error.message ?? '') : ''
  throw new ApiError(code === '' ? 'http-' + String(response.status) : code, message)
}
