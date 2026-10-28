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

/**
 * 插件「在 / 不在」的状态与两个广播。
 *
 * 用户把插件关掉之后，宿主那侧的路由立刻消失，而**已经注入到界面里的槽位不会自己走掉** ——
 * 页签还挂着，一读数据就是 404/405。与其在面板里刷一片红字，不如承认「我已经不该在这儿了」：
 * 接线层订阅 `gone` 把槽位卸掉。
 *
 * 反过来也必须成立：**重新启用插件之后要能自己回来**。只要任意一次请求拿到了宿主的真实回执
 * （哪怕回执是业务错误），就说明路由已经在了 —— 广播 `revived`，接线层把槽位重新挂上。
 * 早先只做了前者，于是「先停用再启用」之后侧栏图标再也回不来。
 */
const goneListeners = new Set<() => void>()
const revivedListeners = new Set<() => void>()
let gone = false

export function onPluginGone(listener: () => void): () => void {
  goneListeners.add(listener)
  if (gone) queueMicrotask(() => listener())
  return () => { goneListeners.delete(listener) }
}

export function onPluginRevived(listener: () => void): () => void {
  revivedListeners.add(listener)
  return () => { revivedListeners.delete(listener) }
}

/** 当前是否处于「宿主上没有这条接口」的状态（探活循环据此决定要不要继续探）。 */
export function isPluginGone(): boolean {
  return gone
}

function broadcast(listeners: Set<() => void>): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* 一个监听器坏掉不该拖住其余监听器 */
    }
  }
}

/** 只广播一次：之后的失败都只是同一个事实的回声。 */
function reportGone(): void {
  if (gone) return
  gone = true
  broadcast(goneListeners)
}

/** 拿到一次真实回执 = 插件回来了。只在状态翻转时广播。 */
function reportRevived(): void {
  if (!gone) return
  gone = false
  broadcast(revivedListeners)
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
  // 405 是宿主对「这条路径没有 POST 处理器」的回答，404 是路径整体没了 —— 两者都只说明
  // 一件事：插件这一侧已经不在了。先于解析 body 判断，因为 405 的 body 往往不是 JSON。
  if (response.status === 404 || response.status === 405) {
    reportGone()
    throw opError('工具中心已停用（宿主上没有这条接口）。重新启用后会自动恢复。', 'error.pluginUnavailable')
  }
  const text = await response.text()
  let payload: { ok?: boolean; data?: unknown; error?: unknown; code?: unknown; params?: unknown }
  try {
    payload = text === '' ? {} : JSON.parse(text)
  } catch {
    throw opError(`宿主返回了非 JSON 内容（HTTP ${response.status}）`, 'error.protocol')
  }
  // 走到这里说明宿主真的答了这一条 op（业务失败也算）—— 插件在场，状态翻转回「在」。
  if (response.ok || payload.ok === false) reportRevived()
  if (payload.ok === false) {
    const message = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw opError(
      message,
      typeof payload.code === 'string' ? payload.code : undefined,
      payload.params as Record<string, unknown> | undefined,
    )
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
