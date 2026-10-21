/**
 * "Where does this session live", answered by the Client itself.
 *
 * The Host route can only name the workspace of a LIVE session: `sessions.get()`
 * finds live sessions, and a cold session's `header.cwd` only becomes readable
 * after its resume has started. Opening an OLD session mounts the composer (and
 * therefore this plugin's row) before that resume finishes, so the first answer
 * the row gets is "workspace unknown" — which used to leave the row hidden until
 * the session was opened a second time.
 *
 * The Client's own session catalog is built from stored headers, so it already
 * knows the directory of a session nobody has resumed. That is the earliest
 * correct answer available, and it is only a hint: the Host still owns the truth
 * and folds this path onto its registered workspace.
 *
 * Everything is probed defensively — a host build without this shape yields ''
 * and the caller falls back to the session-scoped Host answer.
 */

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
    const snapshot = catalog.list?.getSnapshot?.()
    const row = snapshot?.byId?.[sessionId]
    return row !== undefined && typeof row.cwd === 'string' ? row.cwd : ''
  } catch {
    return ''
  }
}
