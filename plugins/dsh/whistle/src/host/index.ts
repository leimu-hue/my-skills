/**
 * Host 入口：只做接线。
 *
 * 分层（每层知道的越少越好）：
 *   shared/    失败身份、时间预算、尽力而为的 attempt
 *   whistle/   Local Agent API 的加载与类型、抓包查询、格式化、规则纯逻辑
 *   tools/     七个 `whistle_*` 工具的声明与渲染
 *
 * 本插件只有 Host 一半：没有面板、没有路由、不写任何文件。它唯一的副作用是
 * 在用户明确要求时改 whistle 的规则文件与 Values（`whistle_rules` / `whistle_values`）。
 */
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_COMMAND, DEFAULT_TIMEOUT_MS, MIN_API_VERSION, WhistleClient } from './whistle/client.ts'
import { createTools } from './tools/index.ts'

export const name = 'whistle'

/**
 * 只依赖 `tools`：本插件不读工作区、不碰沙箱、不注册路由，
 * 因此在一个没有会话服务的 Host 上也能加载。
 */
export const inject = ['tools']

export interface Config {
  /** whistle 命令行；默认 `w2`。可以填完整路径（Windows 上是 `w2.cmd`）。 */
  command?: string
  /** 直接指定 `bin/api` 的绝对路径，跳过 `w2 root bin/api` 探测。 */
  apiPath?: string
  /** 单次调用超时（毫秒）；默认 20000。 */
  timeoutMs?: number
  /** 最低 API 版本；留空表示跳过版本校验。 */
  minVersion?: string
}

export const Config: Schema<Config> = Schema.object({
  command: Schema.string().default(DEFAULT_COMMAND)
    .description('whistle 命令行；默认 w2，可填完整路径（Windows 上是 w2.cmd）'),
  apiPath: Schema.string()
    .description('直接指定 bin/api 的绝对路径，跳过 w2 root bin/api 探测'),
  timeoutMs: Schema.number().min(1).default(DEFAULT_TIMEOUT_MS)
    .description('单次 whistle 调用超时（毫秒）；超时会报错而不是拖住这一轮'),
  minVersion: Schema.string().default(MIN_API_VERSION)
    .description('最低 whistle 版本；留空表示跳过版本校验'),
})

export function apply(ctx: Context, config: Config): void {
  const client = new WhistleClient({
    command: config?.command,
    apiPath: config?.apiPath,
    timeoutMs: config?.timeoutMs,
    minVersion: config?.minVersion,
  })

  /* `tools.register()` 自己把 disposer 挂到调用它的上下文上。 */
  for (const tool of createTools(client)) ctx.tools.register(tool)

  /* 缓存的只是 API 模块本身；插件卸载/重载时清掉，避免持有旧版本的 require 结果。 */
  ctx.effect(() => () => client.dispose(), 'whistle: local agent api cache')
}
