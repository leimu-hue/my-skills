/**
 * 「这个会话落在哪里」，由 Client 自己回答。
 *
 * Host 路由只能说出 LIVE 会话的工作区：`sessions.get()` 找的是活着的会话，而
 * 冷会话的 `header.cwd` 要等它的 resume 开始之后才可读。打开旧会话时，输入框
 * （因而本插件的这一行）在那次 resume 结束前就挂载了，于是这一行拿到的第一个
 * 答案就是 "workspace unknown"——过去这会让该行一直隐藏，直到用户第二次打开
 * 这个会话。
 *
 * Client 自己的会话目录是用存储的 header 建起来的，所以它已经知道一个没人
 * resume 过的会话在哪个目录。这是当时能拿到的最早的正确答案，而且它只是提示：
 * 真相仍归 Host，由它把这个路径归并到已注册的工作区。
 *
 * 所有探测都是防御式的——Host 构建若没有这个形状就返回 ''，调用方回退到会话级
 * 的 Host 答案。
 */
import type { WorkspaceHint } from './types.js'

export interface SessionCatalogRow {
  cwd?: unknown
}

export interface SessionCatalogLike {
  list?: {
    getSnapshot?(): { byId?: Record<string, SessionCatalogRow | undefined> }
  }
}

export function sessionWorkspace(ctx: { get(name: string): unknown }, sessionId: unknown): string {
  if (typeof sessionId !== 'string' || sessionId === '') return ''
  let catalog: SessionCatalogLike | undefined
  try {
    catalog = ctx.get('sessions') as SessionCatalogLike | undefined
  } catch {
    return ''
  }
  if (catalog === undefined || catalog === null) return ''
  try {
    const row = catalog.list?.getSnapshot?.()?.byId?.[sessionId]
    return row !== undefined && typeof row.cwd === 'string' ? row.cwd : ''
  } catch {
    return ''
  }
}

/** 把 `sessionWorkspace` 绑定到某个插件上下文，正是各 store 想要的形式。 */
export function workspaceHintOf(ctx: { get(name: string): unknown }): WorkspaceHint {
  return (sessionId: string) => sessionWorkspace(ctx, sessionId)
}
