/**
 * Everything about "where am I" and "what may I write".
 *
 * The Harness ships no type package we can import, so this module declares the
 * tiny structural slice of the Cordis context it actually uses. Everything is
 * optional and probed defensively: the plugin must stay inert (not throw) on a
 * host that lacks one of these services.
 */
import { normalizePath, workspaceKey } from './store.js'
import type { WorkspaceRow } from './types.js'
import type { SandboxFact } from './prompt.js'

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
  session?: SessionLike & { header?: SessionHeaderLike }
  ctx?: ServiceBag & { effect(fn: () => unknown, label?: string): () => void }
}

export interface HostContext extends ServiceBag {
  effect(fn: () => unknown, label?: string): () => void
  on?(name: string, listener: (data: unknown) => void): () => void
}

export interface SessionService {
  get(id: string): SessionLike | undefined
}

export interface SandboxService {
  resolve(request: { session?: SessionLike }): SandboxFact
}

export interface WorkspaceRegistryService {
  list(): WorkspaceLike[]
}

export interface DirectoryPickerService {
  pick(signal: AbortSignal): Promise<string | null>
}

function asService<T>(ctx: ServiceBag, name: string): T | undefined {
  try {
    const value = ctx.get(name)
    return value === undefined || value === null ? undefined : value as T
  } catch {
    return undefined
  }
}

export function sessionService(ctx: ServiceBag): SessionService | undefined {
  return asService<SessionService>(ctx, 'sessions')
}

export function sandbox(ctx: ServiceBag): SandboxService | undefined {
  return asService<SandboxService>(ctx, 'sandboxPolicy')
}

export function workspaceRegistry(ctx: ServiceBag): WorkspaceRegistryService | undefined {
  return asService<WorkspaceRegistryService>(ctx, 'workspaceRegistry')
}

export function directoryPicker(ctx: ServiceBag): DirectoryPickerService | undefined {
  return asService<DirectoryPickerService>(ctx, 'directoryPickerController')
}

export function sessionOf(ctx: ServiceBag, id: unknown): SessionLike | undefined {
  if (typeof id !== 'string' || id === '') return undefined
  const service = sessionService(ctx)
  if (service === undefined || typeof service.get !== 'function') return undefined
  try { return service.get(id) } catch { return undefined }
}

/**
 * A workspace's canon: `workspace.path` is the realpath stamp minted at create,
 * while `session.header.cwd` is only guaranteed absolute — so prefer the
 * registered spelling and fall back to the session's own directory.
 */
export function canonicalWorkspace(ctx: ServiceBag, raw: unknown): string {
  const normalized = normalizePath(raw)
  if (normalized === '') return ''
  const registry = workspaceRegistry(ctx)
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      const key = workspaceKey(normalized)
      const found = registry.list().find((workspace) => workspaceKey(workspace.path) === key)
      if (found !== undefined && typeof found.path === 'string') return found.path
    } catch { /* unregistered workspace: keep the session's own path */ }
  }
  return normalized
}

/** The session's committed directory, not its current `cwd`. */
export function workspaceOfSession(ctx: ServiceBag, session: SessionLike | undefined): string {
  if (session === undefined) return ''
  const header = session.header
  if (header !== undefined && typeof header.cwd === 'string' && header.cwd !== '') return canonicalWorkspace(ctx, header.cwd)
  return ''
}

export function workspaceOfAgent(ctx: ServiceBag, agent: AgentLike | undefined): string {
  if (agent === undefined) return ''
  if (agent.session !== undefined) return workspaceOfSession(ctx, agent.session)
  return workspaceOfSession(ctx, sessionOf(ctx, agent.id))
}

/** The live sandbox policy for one session, as the prompt should state it. */
export function sandboxFactOf(ctx: ServiceBag, session: SessionLike | undefined): SandboxFact | null {
  const service = sandbox(ctx)
  if (service === undefined || typeof service.resolve !== 'function') return null
  try {
    const resolved = service.resolve(session === undefined ? {} : { session })
    if (resolved === null || typeof resolved !== 'object') return null
    return { mode: String(resolved.mode), workspaceRoot: String(resolved.workspaceRoot) }
  } catch {
    return null
  }
}

/**
 * The panel lists DSH's OWN workspaces, not just the groups this plugin happens
 * to have: a workspace with no related projects yet must still be visible, or
 * there is no way to configure it. Groups whose workspace vanished from the
 * registry stay visible (marked unregistered) so their projects are not lost.
 */
export function workspaceRows(
  ctx: ServiceBag,
  groups: { key: string; path: string; projects: WorkspaceRow['projects'] }[],
): WorkspaceRow[] {
  const rows: WorkspaceRow[] = []
  const seen = new Set<string>()
  const registry = workspaceRegistry(ctx)
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      for (const workspace of registry.list()) {
        if (workspace === null || typeof workspace !== 'object' || typeof workspace.path !== 'string') continue
        const key = workspaceKey(workspace.path)
        if (key === '') continue
        seen.add(key)
        const group = groups.find((candidate) => candidate.key === key)
        rows.push({
          key,
          path: workspace.path,
          title: typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : null,
          registered: true,
          projects: group === undefined ? [] : group.projects,
        })
      }
    } catch { /* fall back to the groups alone */ }
  }
  for (const group of groups) {
    if (seen.has(group.key)) continue
    rows.push({ key: group.key, path: group.path, title: null, registered: false, projects: group.projects })
  }
  return rows
}
