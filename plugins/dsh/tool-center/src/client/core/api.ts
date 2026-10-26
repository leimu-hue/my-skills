/**
 * 唯一的传输通道：`POST /tool-center/api`，body `{ op, args }`。
 *
 * 路由由 Host 半侧注册在同源下，所以 URL 以 `document.baseURI` 解析 —— 部署在子路径下
 * （反向代理、静态服务器）时，写死 `/` 会把请求发到站点根而 404。
 *
 * `x-dsh-plugin` 头是插件自己的门禁，不是凭证：跨站页面想带它就必须过 CORS 预检，而这条
 * 路由从不回应预检，所以它能挡住别的标签页里乱发的一发表单提交。
 */

export const PLUGIN_ID = 'tool-center'

export interface OpError extends Error {
  code?: string
  params?: Record<string, unknown>
}

function endpoint(): string {
  return new URL('tool-center/api', document.baseURI).toString()
}

export async function callOp<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-plugin': PLUGIN_ID },
      body: JSON.stringify({ op, args }),
      credentials: 'same-origin',
    })
  } catch (cause) {
    throw opError(`请求没有发出去：${describeCause(cause)}`, 'error.network')
  }
  const text = await response.text()
  let payload: { ok?: boolean; data?: unknown; error?: unknown; code?: unknown; params?: unknown }
  try {
    payload = text === '' ? {} : JSON.parse(text)
  } catch {
    throw opError(`宿主返回了非 JSON 内容（HTTP ${response.status}）`, 'error.protocol')
  }
  if (payload.ok === false) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw opError(message, typeof payload.code === 'string' ? payload.code : undefined, payload.params as Record<string, unknown> | undefined)
  }
  if (!response.ok) throw opError(`HTTP ${response.status}`, 'error.http')
  return payload.data as T
}

/** 从任意异常里取一句人话（视图与 hook 共用）。 */
export function describeCause(cause: unknown): string {
  return String((cause as Error)?.message ?? cause)
}

function opError(message: string, code?: string, params?: Record<string, unknown>): OpError {
  const error = new Error(message) as OpError
  error.code = code
  if (params !== undefined) error.params = params
  return error
}

/** 把 File 读成 base64（ZIP 导入走这条路）。 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

/** 把宿主返回的 base64 负载触发成一次浏览器下载。 */
export function downloadBase64(filename: string, base64: string): void {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
