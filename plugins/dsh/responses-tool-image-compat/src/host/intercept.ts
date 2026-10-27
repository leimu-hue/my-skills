/**
 * 在 HTTP 边界上给 Responses 请求做规范化。
 *
 * 为什么是 fetch：宿主把会话组装出来的请求 deep-freeze——消息形状在服务层是不可改的。
 * 而这次不兼容发生在**线协议**上（网关只收 string 的 function_call_output.output），
 * 所以唯一同时满足「不改会话历史」「立刻修复已中毒会话」「对所有适配器生效」的
 * 落点就是出站请求体。
 *
 * 时序上也成立：适配器每次请求都新建 OpenAI SDK client，而该 SDK 是在**构造时**
 * 读取全局 fetch 的，因此在这里替换 globalThis.fetch 对后续每个请求都生效。
 */
import {
  endpointMatches,
  isResponsesEndpoint,
  normalizeResponsesBody,
  type NormalizeOptions,
  type NormalizeResult,
  type ToolOutputStrategy,
} from './normalize.js'

/** 安装标记，避免同一进程里重复包裹。 */
const PATCH_MARK = Symbol.for('dsh.responses-tool-image-compat.installed')

type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>

export interface InstalledState {
  /** 统计：被改写的请求数。 */
  requests: number
  /** 统计：被改写的 tool 输出条目数。 */
  items: number
  /** 统计：被 hoist 出去的多模态分段数。 */
  parts: number
  /** 恢复原始 fetch。 */
  restore: () => void
}

interface PatchGlobalRegistry {
  [PATCH_MARK]?: InstalledState
}

export interface InstallOptions extends NormalizeOptions {
  /** 只规范化这些端点；`['*']` 或空数组表示全部 Responses 端点。 */
  endpoints?: readonly string[]
  /** 观测钩子，便于插件把改写事实写进日志。 */
  onRewrite?: (info: { url: string; result: NormalizeResult }) => void
}

/** 取全局对象（Node 里就是 globalThis；留一层是为了浏览器/测试环境）。 */
function globalObject(): (typeof globalThis & PatchGlobalRegistry) {
  return globalThis as typeof globalThis & PatchGlobalRegistry
}

function isStringBody(body: unknown): body is string {
  return typeof body === 'string'
}

/**
 * 尝试改写一次请求。命中并改写时返回新的 init，否则返回 undefined
 * （调用方据此原样透传，字节级不变，保护 prompt cache）。
 */
function rewriteRequest(
  url: string,
  init: Record<string, unknown>,
  options: InstallOptions,
): { init: Record<string, unknown>; result: NormalizeResult } | undefined {
  const method = typeof init.method === 'string' ? init.method.toUpperCase() : 'GET'
  if (method !== 'POST') return undefined
  if (!isResponsesEndpoint(url)) return undefined
  if (!endpointMatches(url, options.endpoints ?? ['*'])) return undefined

  const body = init.body
  if (!isStringBody(body)) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }

  const result = normalizeResponsesBody(parsed, options)
  if (!result.changed) return undefined

  return {
    init: { ...init, body: JSON.stringify(result.body) },
    result,
  }
}

/**
 * 包裹 globalThis.fetch。幂等：重复调用返回已有的安装状态。
 */
export function installFetchNormalizer(options: InstallOptions = {}): InstalledState {
  const scope = globalObject()
  const existing = scope[PATCH_MARK]
  if (existing !== undefined) return existing

  const original = scope.fetch as FetchLike | undefined
  if (typeof original !== 'function') {
    // 没有全局 fetch 就没有可拦截的 HTTP 边界；返回空实现让插件优雅降级。
    const inert: InstalledState = {
      requests: 0,
      items: 0,
      parts: 0,
      restore: () => {},
    }
    return inert
  }

  const state: InstalledState = {
    requests: 0,
    items: 0,
    parts: 0,
    restore: () => {
      scope.fetch = original as typeof fetch
      delete scope[PATCH_MARK]
    },
  }

  const patched = async function patchedFetch(input: unknown, init?: unknown): Promise<unknown> {
    try {
      // 只处理 (url, init) 形态：OpenAI SDK 走的正是这条。
      // Request 对象形态（body 已被消费）无法安全改写，直接透传。
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : undefined

      if (url !== undefined && init !== null && typeof init === 'object') {
        const rewritten = rewriteRequest(url, init as Record<string, unknown>, options)
        if (rewritten !== undefined) {
          state.requests += 1
          state.items += rewritten.result.rewrittenItems
          state.parts += rewritten.result.hoistedParts
          try {
            options.onRewrite?.({ url, result: rewritten.result })
          } catch {
            // 观测失败绝不影响请求本身。
          }
          return original.call(scope, input, rewritten.init)
        }
      }
    } catch {
      // 规范化自身出错时退回原始请求，绝不让兼容层成为新的故障点。
    }
    return original.call(scope, input, init)
  }

  scope.fetch = patched as unknown as typeof fetch
  scope[PATCH_MARK] = state
  return state
}

/** 测试/热重载用：撤销包裹。 */
export function uninstallFetchNormalizer(): void {
  const scope = globalObject()
  scope[PATCH_MARK]?.restore()
}

export type { ToolOutputStrategy, NormalizeResult }
