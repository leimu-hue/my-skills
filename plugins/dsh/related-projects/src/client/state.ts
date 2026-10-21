/**
 * Client-side cache: one shared snapshot per view, refreshed explicitly after a
 * mutation. Deliberately dumb — the host owns the truth, this only avoids
 * refetching on every render.
 *
 * The one piece of judgement here: a session-scoped view whose workspace the
 * Host could not resolve yet is NOT a settled answer. That happens when an old
 * session's resume has not finished while its composer is already rendered, so
 * the store keeps asking on a bounded backoff instead of caching "no workspace"
 * for the lifetime of the page.
 */
import { call } from './api.js'
import { useReact } from './runtime.js'

export interface ProjectView {
  id: string
  path: string
  name: string
  note: string
  enabled: boolean
  origin: 'user' | 'agent'
  exists: boolean
}

export interface WorkspaceRow {
  key: string
  path: string
  title: string | null
  registered: boolean
  projects: ProjectView[]
}

export interface GroupView {
  key: string
  path: string
  updatedAt: number
  projects: ProjectView[]
}

export interface StateValue {
  settings: { alwaysShowDock: boolean }
  workspace: { key: string; path: string } | null
  projects: ProjectView[]
  groups: GroupView[]
  workspaces: WorkspaceRow[]
  limits: { max: number; noteMax: number; nameMax: number }
}

export interface Snapshot {
  status: 'idle' | 'ready' | 'error'
  data: StateValue | null
  error: unknown
}

/** A session's directory as the Client already knows it; '' when unknown. */
export type WorkspaceHint = (sessionId: string) => string

export interface Store {
  subscribe(listener: () => void): () => void
  get(): Snapshot
  refresh(force?: boolean): Promise<StateValue | null>
}

/**
 * Backoff for "the Host has not resolved this session's workspace yet". Bounded
 * on purpose: a session that never becomes resolvable (archived, foreign, or one
 * the Host refuses) must not poll for the lifetime of the page. One minute of
 * patience covers any real resume; a focus/visibility change asks again anyway.
 */
const WORKSPACE_RETRY_MS = [120, 250, 500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 15000]
const LAST_RETRY_MS = 15000

export function createStore(load: () => Promise<StateValue>, requireWorkspace = false): Store {
  let snapshot: Snapshot = { status: 'idle', data: null, error: null }
  const listeners = new Set<() => void>()
  let inflight: Promise<StateValue | null> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let retries = 0

  const emit = (): void => {
    for (const listener of Array.from(listeners)) {
      try { listener() } catch { /* a broken subscriber must not stop the rest */ }
    }
  }

  const cancelRetry = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  /* Only a session-scoped view can be in this state, and only while the Host is
     still finding out where that session lives. */
  const scheduleRetry = (data: StateValue): void => {
    if (requireWorkspace !== true || data.workspace !== null) {
      retries = 0
      cancelRetry()
      return
    }
    if (retries >= WORKSPACE_RETRY_MS.length) return
    const delay = WORKSPACE_RETRY_MS[retries] ?? LAST_RETRY_MS
    retries += 1
    cancelRetry()
    timer = setTimeout(() => {
      timer = null
      void refresh(true)
    }, delay)
  }

  function refresh(force?: boolean): Promise<StateValue | null> {
    if (inflight !== null && force !== true) return inflight
    /* A `ready` snapshot is a settled answer — except for a session-scoped view
       whose workspace the host could not resolve (still starting, or just
       reloaded). That answer must stay retryable instead of being cached for
       the page's lifetime. A view that never needs a workspace is exempt, or it
       would refetch on every caller. */
    const settled = snapshot.status === 'ready'
      && snapshot.data !== null
      && (requireWorkspace !== true || snapshot.data.workspace !== null)
    if (settled && force !== true) return Promise.resolve(snapshot.data)
    inflight = load()
      .then((data) => {
        snapshot = { status: 'ready', data, error: null }
        emit()
        scheduleRetry(data)
        return data
      })
      .catch((error: unknown) => {
        snapshot = { status: 'error', data: snapshot.data, error }
        emit()
        return null
      })
      .then((value) => { inflight = null; return value })
    return inflight
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    get() {
      return snapshot
    },
    refresh,
  }
}

/** The panel's view: every workspace, no session context. */
export const groupStore = createStore(() => call<StateValue>('state', {}))

/** The composer row's view: one per session, so its workspace is the session's. */
const dockStores = new Map<string, Store>()

export function dockStoreFor(sessionId: unknown, hint: WorkspaceHint = () => ''): Store {
  const key = String(sessionId ?? '')
  let store = dockStores.get(key)
  if (store === undefined) {
    /* The hint is read per request, not once at creation: the first answer may
       come before the Client's session catalog has loaded, and the retry after
       that must be able to use it. */
    const request = (): Record<string, unknown> => {
      const body: Record<string, unknown> = { sessionId: key }
      const workspace = hint(key)
      if (workspace !== '') body.workspace = workspace
      return body
    }
    store = createStore(() => call<StateValue>('state', request()), true)
    dockStores.set(key, store)
  }
  return store
}

export function refreshDockStores(): void {
  for (const store of dockStores.values()) void store.refresh(true)
}

export function useSnapshot(store: Store): Snapshot {
  const React = useReact()
  return React.useSyncExternalStore(store.subscribe, store.get, store.get)
}
