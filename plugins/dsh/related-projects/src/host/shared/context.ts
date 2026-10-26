/**
 * Cordis 上下文里 Host 用到的那一片结构。
 *
 * Harness 没有可供导入的类型包，所以每个服务都只声明本插件真正用到的那点形状。
 * 全部都是可选的，并且都做了防御性探测：Host 缺少其中某个服务时，插件必须保持
 * 安静（而不是抛错）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ConnectionService } from './types.js'

export interface SessionHeaderLike {
  cwd?: string
}

export interface SessionLike {
  id: string
  header?: SessionHeaderLike
}

export interface WorkspaceLike {
  path?: string
  title?: string
}

export interface ServiceBag {
  get(name: string): unknown
}

export interface AgentLike {
  id: string
  session?: SessionLike
  ctx?: ServiceBag & { effect(fn: () => unknown, label?: string): () => void }
}

export interface HostContext extends ServiceBag {
  effect(fn: () => unknown, label?: string): () => void
  on?(name: string, listener: (data: unknown) => void): () => void
  /**
   * 这些服务就绪后执行回调 —— 已经就绪就立即执行。可选服务不能因此变成硬依赖，
   * 也不能在组合到 apply() 之后才提供它时被漏掉。
   */
  inject?(names: string[], callback: (scoped: HostContext) => void): unknown
}

/** `ctx.webServer`：具名路由（自身不带认证）。 */
export interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** `ctx.tools`：面向 agent 的工具注册表。 */
export interface ToolsService {
  register(definition: unknown): () => void
}

/** `ctx.sessions`：按 id 索引的活跃会话。 */
export interface SessionService {
  get(id: string): SessionLike | undefined
}

/** `ctx.sandboxPolicy`：此会话可写到哪里。 */
export interface SandboxService {
  resolve(request: { session?: SessionLike }): { mode?: unknown } | null
}

/** `ctx.workspaceRegistry`：DSH 自己列出的那些工作区。 */
export interface WorkspaceRegistryService {
  list(): WorkspaceLike[]
}

/** `ctx.directoryPickerController`：操作系统的目录选择器。 */
export interface DirectoryPickerService {
  pick(signal: AbortSignal): Promise<string | null>
}

/** `ctx.agents`：本插件（重新）加载时已经活着的 agent。 */
export interface AgentsService {
  list?(): Iterable<unknown>
}

/** agent 自己作用域上的 `systemPrompt`：按会话区分的提示词通道。 */
export interface PromptService extends ServiceBag {
  section(section: { name: string; order: number; text: () => string; interpolate?: boolean }): () => void
  context?(context: { name: string; order: number; text: string; interpolate?: boolean }): () => void
}

function asService<T>(ctx: ServiceBag | undefined, name: string): T | undefined {
  if (ctx === undefined) return undefined
  try {
    const value = ctx.get(name)
    return value === undefined || value === null ? undefined : value as T
  } catch {
    return undefined
  }
}

export const sessionService = (ctx: ServiceBag | undefined): SessionService | undefined =>
  asService<SessionService>(ctx, 'sessions')

export const sandboxService = (ctx: ServiceBag | undefined): SandboxService | undefined =>
  asService<SandboxService>(ctx, 'sandboxPolicy')

export const workspaceRegistry = (ctx: ServiceBag | undefined): WorkspaceRegistryService | undefined =>
  asService<WorkspaceRegistryService>(ctx, 'workspaceRegistry')

export const directoryPicker = (ctx: ServiceBag | undefined): DirectoryPickerService | undefined =>
  asService<DirectoryPickerService>(ctx, 'directoryPickerController')

export const promptService = (scope: ServiceBag | undefined): PromptService | undefined =>
  asService<PromptService>(scope, 'systemPrompt')

export const connectionService = (ctx: ServiceBag | undefined): ConnectionService | undefined =>
  asService<ConnectionService>(ctx, 'connection')
