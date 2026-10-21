/**
 * The `@` source: related projects in the official trigger menu.
 *
 * This is the supported extension point — the menu, its keyboard handling and its
 * grouping belong to `dsh-client-ui-input-trigger`; a source only supplies rows
 * and says what a pick inserts. No menu UI, no DOM, no replacement of a shipped
 * service.
 *
 * Contract (verified against `dsh-file-mention`, which registers the `@file`
 * source the same way):
 *   ctx.get('inputTriggers').registerSource({ trigger, name, order,
 *     candidates(session, { query, signal }), warm?(session),
 *     onPick(pick) -> { insert: { source, ref, label, clipboardText } },
 *     codec: { clipboardText(ref), serialize(ref) } })
 * Registering the same (trigger, name) twice throws, so the caller must catch.
 *
 * A candidate may also carry what the shipped file/session rows carry and this
 * menu renders for them: `icon` ('file' | 'folder' | 'session'), `section` (a
 * heading inside the group) and `value` (an opaque payload handed back to
 * `onPick`). The `value` payload keeps the inserted path out of the displayed
 * text.
 */
import { call } from './api.js'
import type { Translate } from './locale.js'
import type { ProjectView, StateValue, WorkspaceHint } from './state.js'

/** One file or directory inside a related project, as the Host searched it. */
export interface FileHit {
  path: string
  rel: string
  name: string
  kind: 'file' | 'directory'
  project: string
  score: number
}

/**
 * A reference string with the trailing-slash convention the mention grammar uses:
 * a directory ends with `/`, a file does not. Backslashes fold to `/` because the
 * reference crosses into the draft as text.
 */
function referenceOf(path: string, directory: boolean): string {
  const text = String(path).replace(/\\/g, '/').replace(/\/+$/, '')
  return directory ? text + '/' : text
}

/** Wrap an already-formed reference as the `@` token the composer inserts. */
function tokenOf(reference: string): string {
  if (reference === '' || /["\u0000-\u001f]/.test(reference)) return ''
  return /\s/.test(reference) ? '@"' + reference + '"' : '@' + reference
}

/** The drill payload for one crumb: the directory it navigates to. */
function drillValue(label: string, path: string): string {
  return JSON.stringify({ kind: 'directory', label, mention: referenceOf(path, true) })
}

/**
 * The source's `name` doubles as the visible group title: the menu renders
 * `t(sourceName)` in its own `slash.menu` namespace and falls back to the raw
 * name when the key is unknown. Registering a dictionary entry there loses to the
 * pipeline's own whole-namespace registration when the pipeline applies later, so
 * the title is carried by the name itself — no dictionary race at all.
 */
export const SOURCE_KEY = 'related-projects'
const TRIGGER = '@'
/* The pipeline sorts sources ascending by `order ?? 0` (see
   dsh-client-ui-input-trigger: `sources(...).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))`).
   The shipped `@` source that carries file AND session rows ("reference") declares
   NO order, so it sorts as 0 — an order of 1 put this group after it, which is the
   bottom of the menu. "The projects this change touches" should be the first thing
   the menu shows for an empty query, so this group sorts strictly before zero. */
const ORDER = -10
const CACHE_TTL_MS = 10_000

export interface TriggerCandidate {
  name: string
  description?: string
  /** Rendered as the row's leading glyph; 'file' | 'folder' | 'session' in the shell. */
  icon?: string
  /** Heading the row renders under, inside this source's group. */
  section?: string
  /** A directory row: `pick` inserts it, `drill` (Tab / the chevron) enters it. */
  drill?: boolean
  /** Opaque payload handed back verbatim through `onPick`. */
  value?: string
}

export interface TriggerSession {
  sessionId: string
}

export interface TriggerRequest {
  query: string
  signal: AbortSignal
}

export interface TriggerHeaderRequest {
  query: string
  quoted?: boolean
  drilled?: boolean
}

/** A breadcrumb above the group; `value` comes back through `onPick` as a drill. */
export interface TriggerCrumb {
  label: string
  value: string
  current?: boolean
}

export interface TriggerPick {
  session: TriggerSession
  candidate: TriggerCandidate
  query?: string
  /** 'pick' (default) or 'drill' for a directory row. */
  action?: string
}

export interface TriggerSource {
  trigger: string
  name: string
  order: number
  candidates(session: TriggerSession, request: TriggerRequest): Promise<TriggerCandidate[]>
  /** Breadcrumbs for the current level; published only after a drill. */
  header?(session: TriggerSession, request: TriggerHeaderRequest): TriggerCrumb[] | undefined
  warm?(session: TriggerSession): void
  onPick(pick: TriggerPick): unknown
  codec: { clipboardText(ref: string): string; serialize(ref: string): Promise<string> }
  lexicon?(session: TriggerSession): string[] | undefined
}

interface Cached {
  at: number
  projects: ProjectView[]
}

/** One source object per plugin instance; candidates are cached per session. */
export function createTriggerSource(
  title: string,
  hint: WorkspaceHint = () => '',
  t: Translate = (key: string) => key,
): TriggerSource {
  /* The menu shows the source name as the group heading, so the display text IS
     the name — while `SOURCE_KEY`-style identity is not needed anywhere else. */
  const sourceName = title
  const cache = new Map<string, Cached>()

  const load = async (sessionId: string): Promise<ProjectView[]> => {
    const hit = cache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.projects
    /* The Client's catalog already knows a cold (old) session's directory; the
       Host only knows it once that session is live. Sending both makes the first
       `@` of a just-opened old session list the projects it will need. */
    const workspace = hint(sessionId)
    const state = workspace === ''
      ? await call<StateValue>('state', { sessionId })
      : await call<StateValue>('state', { sessionId, workspace })
    /* Only enabled, still-existing directories can be offered: a row that cannot
       be opened would burn a pick. */
    const projects = state.projects.filter((project) => project.enabled !== false && project.exists !== false)
    /* "The workspace is not resolvable yet" is not "this workspace has none": an
       unresolved answer must not be cached, or the menu stays empty for a session
       whose resume is still in flight. */
    if (state.workspace !== null) cache.set(sessionId, { at: Date.now(), projects })
    return projects
  }

  /**
   * Files inside the projects, for a non-empty query. Never throws: a menu that
   * cannot reach the Host still shows the project roots, so a failed search must
   * not take the whole group down.
   */
  const files = async (sessionId: string, query: string): Promise<FileHit[]> => {
    const workspace = hint(sessionId)
    try {
      const answer = await call<{ rows?: FileHit[] }>('files', workspace === ''
        ? { sessionId, query }
        : { sessionId, workspace, query })
      return Array.isArray(answer.rows) ? answer.rows : []
    } catch {
      return []
    }
  }

  /**
   * Query → rows, with the field priority the file/folder source gives: the rows
   * the query names most precisely come first, and everything the row SHOWS is
   * searchable. That last part is what the note is for — "改了接口/表结构时同步
   * 这里的 API 文档" is exactly how a person remembers which project to pull in,
   * so a note hit must be reachable by typing its words.
   *
   * Every whitespace-separated token must match somewhere (AND, like a file
   * search). CJK writes without spaces, so a query is usually one token and the
   * same rule degrades to a substring match.
   */
  const search = (projects: ProjectView[], query: string): ProjectView[] => {
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '')
    if (tokens.length === 0) return projects
    const hits: { project: ProjectView; score: number }[] = []
    for (const project of projects) {
      const name = project.name.toLowerCase()
      const path = project.path.toLowerCase().replace(/\\/g, '/')
      const note = project.note.toLowerCase()
      let score = 0
      let matched = true
      for (const token of tokens) {
        const inName = name.indexOf(token)
        const inPath = path.indexOf(token)
        const inNote = note.indexOf(token)
        if (inName < 0 && inPath < 0 && inNote < 0) {
          matched = false
          break
        }
        /* Name first: an exact name beats a prefix, a prefix beats a substring.
           Then the path (a segment the user half-remembers), then the note. */
        if (name === token) score += 1000
        else if (inName === 0) score += 500
        else if (inName > 0) score += 300
        else if (inPath >= 0) score += 150
        else score += 50
      }
      if (matched === true) hits.push({ project, score })
    }
    /* Stable for equal scores, so an unranked project keeps registry order. */
    return hits.sort((left, right) => right.score - left.score).map((hit) => hit.project)
  }

  /**
   * One drill step: the children of the directory the query names. Never throws —
   * a failed listing must not take the whole group down.
   */
  const list = async (sessionId: string, dir: string, filter: string): Promise<FileHit[]> => {
    const workspace = hint(sessionId)
    try {
      const answer = await call<{ rows?: FileHit[] }>('list', workspace === ''
        ? { sessionId, dir, filter }
        : { sessionId, workspace, dir, filter })
      return Array.isArray(answer.rows) ? answer.rows : []
    } catch {
      return []
    }
  }

  /** A drilled position: which project, which directory, and the text typed after its last `/`. */
  interface DirTarget {
    project: ProjectView
    dir: string
    filter: string
  }

  /**
   * Read the query as a path when it is one. Drilling works like the shipped file
   * source: a drill pick rewrites the draft to the directory's own reference, so
   * the NEXT query already carries the path — no per-session state to keep in
   * sync. Both the absolute form (`D:/proj/src/`) and the project-relative form
   * (`proj/src/`) resolve; anything else is an ordinary search.
   */
  const dirTarget = (projects: ProjectView[], query: string): DirTarget | null => {
    const text = query.replace(/\\/g, '/')
    const slash = text.lastIndexOf('/')
    if (slash < 0) return null
    const head = text.slice(0, slash + 1)
    const filter = text.slice(slash + 1)
    const headLower = head.toLowerCase()
    for (const project of projects) {
      const root = project.path.replace(/\\/g, '/').replace(/\/+$/, '')
      const rootLower = root.toLowerCase()
      if (headLower === rootLower + '/' || headLower.startsWith(rootLower + '/')) {
        return { project, dir: root + head.slice(root.length), filter }
      }
    }
    /* Project-relative spelling: `xpd-flow-web/src/` — one leading name segment. */
    const first = head.split('/')[0]
    const named = projects.find((project) => project.name.toLowerCase() === first.toLowerCase())
    if (named !== undefined) {
      const root = named.path.replace(/\\/g, '/').replace(/\/+$/, '')
      return { project: named, dir: root + head.slice(first.length), filter }
    }
    return null
  }

  /** Rows of one level: directories drillable, files insertable. */
  const levelRows = (hits: FileHit[]): TriggerCandidate[] => hits.map((entry) => {
    const directory = entry.kind === 'directory'
    return {
      name: directory ? entry.name + '/' : entry.name,
      description: entry.rel,
      icon: directory ? 'folder' : 'file',
      section: t('menu.files'),
      drill: directory,
      value: JSON.stringify({
        kind: entry.kind,
        label: entry.name,
        mention: referenceOf(entry.path, directory),
      }),
    }
  })

  return {
    trigger: TRIGGER,
    name: sourceName,
    order: ORDER,

    async candidates(session, request) {
      /* A menu that never learns the workspace must not block the other groups:
         an unavailable registry yields no rows, silently. */
      let projects: ProjectView[]
      try {
        projects = await load(session.sessionId)
      } catch {
        return []
      }
      if (request.signal.aborted) return []
      const query = request.query

      /* Standing inside a project directory: list that level only, so "需求开发"
         shows what it contains on arrival — not a flattened dump of it. */
      const target = dirTarget(projects, query)
      if (target !== null) {
        const rows = levelRows(await list(session.sessionId, target.dir, target.filter))
        return request.signal.aborted ? [] : rows
      }

      const rows: TriggerCandidate[] = search(projects, query).map((project) => ({
        name: project.name + '/',
        description: project.note === '' ? project.path : project.path + '  ·  ' + project.note,
        icon: 'folder',
        drill: true,
        value: JSON.stringify({ kind: 'project', label: project.name, mention: referenceOf(project.path, true) }),
      }))
      /* Typing asks a second question the project roots cannot answer: "WHICH
         entry under these projects". The Host indexes each project once and
         answers by NAME, so a matching directory arrives as one drillable row
         rather than dragging its contents along. */
      if (query.trim() !== '') {
        rows.push(...levelRows(await files(session.sessionId, query)))
      }
      return request.signal.aborted ? [] : rows
    },

    /* Crumbs for a drilled position: the project, then each directory segment.
       Only published while the menu was actually opened by a drill, matching how
       the shipped source scopes its header. */
    header(session, request) {
      if (request.drilled !== true) return undefined
      let projects: ProjectView[]
      try {
        const hit = cache.get(session.sessionId)
        projects = hit === undefined ? [] : hit.projects
      } catch {
        return undefined
      }
      const target = dirTarget(projects, request.query)
      if (target === null) return undefined
      const root = target.project.path.replace(/\\/g, '/').replace(/\/+$/, '')
      const dir = target.dir.replace(/\\/g, '/').replace(/\/+$/, '')
      const crumbs: { label: string; value: string; current?: boolean }[] = [
        { label: target.project.name, value: drillValue(target.project.name, root) },
      ]
      const rest = dir.slice(root.length).replace(/^\/+/, '')
      if (rest !== '') {
        for (const [index, segment] of rest.split('/').entries()) {
          const path = root + '/' + rest.split('/').slice(0, index + 1).join('/')
          crumbs.push({ label: segment, value: drillValue(segment, path) })
        }
      }
      /* The deepest crumb is where the user already is. */
      const last = crumbs[crumbs.length - 1]
      if (last !== undefined) last.current = true
      return crumbs
    },

    /* Prefetch on warm so the first `@` of a session is not a round trip. */
    warm(session) {
      void load(session.sessionId).catch(() => undefined)
    },

    onPick(pick) {
      /* The row's opaque `value` carries the exact path — the same contract the
         shipped file source uses. Older rows (or a host without the field) fall
         back to the description's leading path. */
      const payload = parseValue(pick.candidate.value)
      const fromDescription = (pick.candidate.description ?? '').split('  ·  ')[0]
      /* A description fallback is a project path, hence a directory reference. */
      const absolute = payload?.mention ?? referenceOf(fromDescription, true)
      const name = payload?.label ?? pick.candidate.name
      const directory = payload !== null ? payload.kind !== 'file' : true

      /* Drilling rewrites the draft to the directory's reference and reopens the
         menu there; picking inserts the reference as a chip. A directory row
         supports both, exactly like the shipped file source. */
      if (directory === true && pick.action === 'drill') {
        return { text: tokenOf(absolute), continue: true }
      }
      return {
        insert: {
          source: sourceName,
          ref: absolute,
          label: directory ? name + '/' : name,
          appearance: directory ? 'folder' : 'file',
          clipboardText: tokenOf(absolute),
        },
      }
    },

    codec: {
      /* `ref` already carries the directory slash convention, so neither codec
         may add one: a file reference must not grow a trailing slash. */
      clipboardText: (ref) => tokenOf(ref),
      serialize: (ref) => Promise.resolve(tokenOf(ref)),
    },

    /* Names are the colorable tokens for plain `@name` text in the draft. */
    lexicon(session) {
      const hit = cache.get(session.sessionId)
      if (hit === undefined) return undefined
      return hit.projects.map((project) => project.name)
    },
  }
}

/** The row payload written by `candidates`: what a pick must insert. */
interface RowValue {
  kind: string
  label: string
  mention: string
}

function parseValue(value: unknown): RowValue | null {
  if (typeof value !== 'string' || value === '') return null
  try {
    const parsed = JSON.parse(value) as Partial<RowValue>
    if (typeof parsed.mention !== 'string' || parsed.mention === '') return null
    return {
      kind: typeof parsed.kind === 'string' ? parsed.kind : 'project',
      label: typeof parsed.label === 'string' && parsed.label !== '' ? parsed.label : parsed.mention,
      mention: parsed.mention,
    }
  } catch {
    return null
  }
}
