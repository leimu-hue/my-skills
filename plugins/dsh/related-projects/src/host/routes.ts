/**
 * The plugin-owned JSON route the Client UI talks to.
 *
 * Change policy lives here: a mutation appends ONE snapshot to the live sessions
 * of that workspace when the caller asks for it (`notify: true`, sent by the panel
 * and by the tool). Appending keeps the cached prompt prefix intact, because the
 * frozen system section is never rewritten — see sessions.ts.
 */
import { sep } from 'node:path'
import { normalizePath, RegistryError, workspaceKey } from './store.js'
import { canonicalWorkspace, directoryPicker, sandboxFactOf, sessionOf, workspaceOfSession, workspaceRows } from './context.js'
import { listDirectory, searchProjects } from './files.js'
import { boundaryText, sectionText } from './prompt.js'
import type { HostContext, ServiceBag } from './context.js'
import type { Registry } from './store.js'
import type { SessionRegistry } from './sessions.js'
import type { ProjectView, StateValue } from './types.js'

interface Payload {
  [key: string]: unknown
}

export type Handler = (payload: Payload) => Promise<unknown>

export interface HandlerDeps {
  ctx: HostContext
  registry: Registry
  sessions: SessionRegistry
  openInFileManager(path: string): void
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function flag(value: unknown): boolean {
  return value === true
}

/**
 * "updated X" is useless to a model that has to decide whether its frozen list is
 * still true, so name the fields that actually moved — the note text included.
 */
function describeUpdate(before: ProjectView | undefined, after: ProjectView): string {
  const parts: string[] = []
  if (before !== undefined && before.name !== after.name) parts.push('renamed "' + before.name + '" to "' + after.name + '"')
  if (before === undefined || before.note !== after.note) {
    parts.push(after.note === '' ? 'note cleared for ' + after.name : 'note for ' + after.name + ' is now "' + after.note + '"')
  }
  if (before !== undefined && before.enabled !== after.enabled) parts.push(after.name + (after.enabled ? ' enabled' : ' disabled'))
  if (parts.length === 0) return 'updated ' + after.name
  return parts.join('; ')
}

export function createHandlers(deps: HandlerDeps): Record<string, Handler> {
  const { ctx, registry, sessions } = deps

  /**
   * Target workspace: an explicit path first, else the session that asked.
   * Both are needed — the panel knows the path, the composer row only knows its
   * session, and guessing produced `workspace-missing` for a workspace that had
   * no group yet.
   */
  const workspaceOf = (payload: Payload): string => {
    const explicit = str(payload.workspace) !== '' ? str(payload.workspace) : str(payload.workspacePath)
    /* The caller may hold the directory earlier than this Host can resolve the
       session: a cold (old) session's `header.cwd` only becomes readable once its
       resume starts, while the Client's own session catalog knows it already.
       Fold that hint onto the registered spelling so both paths agree. */
    if (explicit !== '') return canonicalWorkspace(ctx, explicit)
    const session = sessionOf(ctx, payload.sessionId)
    return workspaceOfSession(ctx, session)
  }

  const requireWorkspace = (payload: Payload): string => {
    const workspace = workspaceOf(payload)
    if (workspace === '') throw new RegistryError('workspace-missing')
    return workspace
  }

  /* A change is appended to live sessions as a snapshot, never pushed into the
     system section (which stays frozen for cache reuse). `notify: true` — what the
     panel and the tool send — is what arms that snapshot. */
  const announce = (workspace: string, summary: string, enabled: unknown): number => {
    if (flag(enabled) !== true) return 0
    return sessions.notify(workspace, summary).delivered
  }

  return {
    async state(payload): Promise<StateValue> {
      /* An explicit path first, else the asking session — the same rule every
         other method uses. The composer row needs this: opening an OLD session
         mounts the composer before that session is live, so the id alone would
         answer "workspace unknown" while the Client already knows the directory
         from its own session catalog. */
      const workspace = workspaceOf(payload)
      const snapshot = registry.snapshot(workspace)
      return {
        ...snapshot,
        workspaces: workspaceRows(ctx, registry.groups()),
        workspace: workspace === '' ? null : { key: workspaceKey(workspace), path: workspace },
      }
    },

    /* Files inside the related projects, for the `@` menu: the shipped file
       source is bounded by the Agent's working directory, and these projects are
       sibling directories outside it. Read-only and capped — see files.ts. */
    async files(payload) {
      const workspace = workspaceOf(payload)
      const query = str(payload.query)
      if (query.trim() === '') return { rows: [] }
      const snapshot = registry.snapshot(workspace)
      const roots = snapshot.projects
        .filter((project) => project.enabled !== false && project.exists !== false)
        .map((project) => ({ path: project.path, name: project.name }))
      return { rows: searchProjects(roots, query, typeof payload.limit === 'number' ? payload.limit : undefined) }
    },

    /* One drill step: the children of a directory that MUST live inside one of
       this workspace's related projects. Anything else is refused, so the menu
       cannot be used to walk the filesystem from a supplied path. */
    async list(payload) {
      const workspace = workspaceOf(payload)
      const dir = normalizePath(str(payload.dir))
      const query = str(payload.filter)
      if (dir === '') throw new RegistryError('not-directory')
      const snapshot = registry.snapshot(workspace)
      const root = snapshot.projects.find((project) => {
        const projectPath = normalizePath(project.path)
        return dir === projectPath || dir.startsWith(projectPath + sep)
      })
      if (root === undefined) throw new RegistryError('no-group')
      return listDirectory(root.path, root.name, dir, query, typeof payload.limit === 'number' ? payload.limit : undefined)
    },

    async add(payload) {
      const workspace = requireWorkspace(payload)
      const project = registry.add(workspace, {
        path: payload.path,
        name: payload.name,
        note: payload.note,
        origin: payload.origin === 'agent' ? 'agent' : 'user',
      })
      const delivered = announce(workspace, 'added ' + project.name + ' (' + project.path + ')', payload.notify)
      return { project, sessions: delivered, ...registry.snapshot(workspace) }
    },

    async update(payload) {
      const workspace = requireWorkspace(payload)
      const before = registry.snapshot(workspace).projects.find((entry) => entry.id === payload.id)
      const project = registry.update(workspace, payload.id, payload.patch)
      const delivered = announce(workspace, describeUpdate(before, project), payload.notify)
      return { project, sessions: delivered, ...registry.snapshot(workspace) }
    },

    async remove(payload) {
      const workspace = requireWorkspace(payload)
      const removed = registry.remove(workspace, payload.id)
      const delivered = announce(workspace, 'removed ' + removed.name, payload.notify)
      return { removed: removed.name, sessions: delivered, ...registry.snapshot(workspace) }
    },

    async copy(payload) {
      const result = registry.copy(payload.from, payload.to)
      const delivered = announce(
        str(payload.to),
        'copied ' + String(result.added) + ' project(s) from another workspace',
        payload.notify,
      )
      return { ...result, sessions: delivered, ...registry.snapshot(payload.to) }
    },

    async ensureGroup(payload) {
      const group = registry.ensureGroup(payload.path)
      return { key: group.key, path: group.path }
    },

    async settings(payload) {
      registry.setSettings(payload)
      return { settings: registry.getSettings() }
    },

    async open(payload) {
      const workspace = requireWorkspace(payload)
      const group = registry.groupFor(workspace)
      const target = group === null ? undefined : group.projects.find((project) => project.id === payload.id)
      if (target === undefined) throw new RegistryError('no-project')
      deps.openInFileManager(target.path)
      return { opened: true }
    },

    async pick() {
      const picker = directoryPicker(ctx as unknown as ServiceBag)
      if (picker === undefined || typeof picker.pick !== 'function') throw new RegistryError('pick-unavailable')
      const picked = await picker.pick(new AbortController().signal)
      return { path: picked === null || picked === undefined ? '' : picked }
    },

    /**
     * Diagnostics: the frozen section this session started with (what the model
     * has in its system prompt) plus how many change snapshots were appended.
     * `current` is what a NEW session would render right now — useful to see the
     * difference the notices are meant to close.
     */
    async prompt(payload) {
      const session = sessionOf(ctx, payload.sessionId)
      const workspace = session === undefined ? str(payload.workspace) : workspaceOfSession(ctx, session)
      const current = sectionText(registry, workspace, boundaryText(sandboxFactOf(ctx, session)))
      const described = typeof payload.sessionId === 'string'
        ? sessions.describe(payload.sessionId)
        : { attached: false, section: 'no-session', notices: 0 }
      return {
        workspace,
        current,
        bytes: Buffer.byteLength(current),
        attached: described.attached,
        section: described.section,
        notices: described.notices,
        liveSessions: sessions.size,
      }
    },
  }
}


