/**
 * 本插件对 Cordis 上下文的唯一补充。
 *
 * `tools` / `webServer` / `sessions` / `sandboxPolicy` / `workspaceRegistry` /
 * `directoryPicker` / `systemPrompt` / `agents` 的类型都由各自的
 * `@deepseek-ai/*` 包通过 `declare module '@deepseek-ai/cordis'` 声明合并给出，
 * 所以 `ctx.get(name)` 直接就是带类型的服务，没挂载时返回 `undefined`。
 *
 * 唯一没有类型包的是 Web 组合里的 `connection`（Host/Origin 校验 + 浏览器会话
 * 认证），它决定具名路由是否放行请求。这里补一个最小接口，缺了只降级不抛错。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionService } from './types.js'

export function connectionOf(ctx: Context): ConnectionService | undefined {
  const value = ctx.get('connection') as ConnectionService | undefined
  return value === undefined || value === null ? undefined : value
}
