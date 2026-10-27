/**
 * Host 入口：只做接线。
 *
 * 这个插件没有 UI，也不注册工具/服务——它只在出站 HTTP 边界上修补一种线协议不兼容：
 * 部分 OpenAI 兼容网关只接受 string 形态的 `function_call_output.output`，
 * 而适配器在工具结果带图片时会发出数组形态，导致整个会话被永久锁死。
 *
 * 分层：
 *   normalize.ts  纯函数：请求体 → 请求体（可单测，无副作用）
 *   intercept.ts  globalThis.fetch 包裹与统计
 *   index.ts      cordis 生命周期（config + ctx.effect 卸载）
 */
import { installFetchNormalizer, type InstalledState } from './intercept.js'
import type { ToolOutputStrategy } from './normalize.js'

export const name = 'responses-tool-image-compat'

/**
 * 不 inject 任何服务：拦截发生在 HTTP 边界，早于/独立于 DSH 服务图。
 * 这让插件在最小 profile 里也能生效（包括 llm 适配器尚未就绪时）。
 */
export const inject: string[] = []

export interface PluginConfig {
  /** 总开关。 */
  enabled: boolean
  /**
   * `hoist` 保留图片能力（把图片挂到下一条 user 消息）；
   * `flatten` 只留文本（图片变占位说明），适合连 image 输入都不稳的端点。
   */
  strategy: ToolOutputStrategy
  /** 只规范化这些端点（主机名或主机名+路径前缀）；`['*']` = 所有 Responses 端点。 */
  endpoints: string[]
  /** hoist 出来的 user 消息的说明前缀。 */
  caption?: string
  /** 每次改写写一条 warn 级日志（默认只在首次改写时记一条，避免刷屏）。 */
  verbose: boolean
}

const DEFAULTS: PluginConfig = {
  enabled: true,
  strategy: 'hoist',
  endpoints: ['*'],
  caption: undefined,
  verbose: false,
}

/** 手工校验：本地插件不引 schemastery，保持零运行时依赖。 */
function readConfig(config?: Partial<PluginConfig>): PluginConfig {
  const enabled = typeof config?.enabled === 'boolean' ? config.enabled : DEFAULTS.enabled
  const strategy: ToolOutputStrategy = config?.strategy === 'flatten' ? 'flatten' : DEFAULTS.strategy
  const endpoints = Array.isArray(config?.endpoints) && config.endpoints.length > 0
    ? config.endpoints.filter((entry): entry is string => typeof entry === 'string')
    : DEFAULTS.endpoints
  const caption = typeof config?.caption === 'string' && config.caption.length > 0 ? config.caption : undefined
  const verbose = typeof config?.verbose === 'boolean' ? config.verbose : DEFAULTS.verbose
  return { enabled, strategy, endpoints, caption, verbose }
}

export interface PluginContext {
  logger?: {
    info?(message: string): void
    warn?(message: string): void
    debug?(message: string): void
  }
  effect?(execute: () => (() => void) | void, label?: string): void
}

export function apply(ctx: PluginContext, config?: Partial<PluginConfig>): void {
  const settings = readConfig(config)

  if (!settings.enabled) {
    ctx.logger?.info?.('[responses-tool-image-compat] disabled by config')
    return
  }

  let announced = false
  const state: InstalledState = installFetchNormalizer({
    strategy: settings.strategy,
    caption: settings.caption,
    endpoints: settings.endpoints,
    onRewrite: ({ url, result }) => {
      const line = `[responses-tool-image-compat] normalized ${result.rewrittenItems} tool output item(s), hoisted ${result.hoistedParts} attachment part(s) for ${url}`
      if (settings.verbose) ctx.logger?.warn?.(line)
      else if (!announced) {
        announced = true
        ctx.logger?.info?.(`${line} (further rewrites logged only in verbose mode)`)
      }
    },
  })

  ctx.logger?.info?.(
    `[responses-tool-image-compat] active: strategy=${settings.strategy}, endpoints=${settings.endpoints.join(',')}`,
  )

  const dispose = () => {
    state.restore()
    ctx.logger?.info?.(
      `[responses-tool-image-compat] disposed after ${state.requests} rewrite(s) (${state.items} item(s), ${state.parts} attachment part(s))`,
    )
  }

  // 没有 effect 能力时（例如被手工 require）至少不要泄漏：进程退出自然回收。
  ctx.effect?.(() => dispose, 'responses-tool-image-compat: restore global fetch')
}

export { installFetchNormalizer, uninstallFetchNormalizer } from './intercept.js'
export { normalizeResponsesBody, isResponsesEndpoint, endpointMatches } from './normalize.js'
