/**
 * Files and directories INSIDE a related project, for the composer's `@` menu.
 *
 * The shipped file source can only search the Agent's working directory — a
 * related project is a sibling directory *outside* that workspace, so its files
 * are invisible there.
 *
 * Two operations, mirroring how the shipped menu behaves:
 *   search  — rank entries whose NAME matches, and once a directory itself is a
 *             hit, its descendants are not listed: the user descends by picking
 *             it (`drill`), exactly like "文件与文件夹".
 *   list    — the direct children of one directory, for that descent.
 *
 * Cost control: an index per project (rebuilt at most once a minute) filtered in
 * memory for every keystroke, hard caps, and a skip list of build/dependency
 * directories so a huge checkout cannot stall the menu or flood it.
 */
import { readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { workspaceKey } from './store.js'

export interface FileHit {
  /** Absolute path, for the inserted mention. */
  path: string
  /** Path relative to the project root, `/`-separated, for display and ranking. */
  rel: string
  name: string
  kind: 'file' | 'directory'
  project: string
  projectPath: string
  score: number
}

/** Directories whose contents are never worth searching from a menu. */
const SKIP = new Set([
  'node_modules', '.git', '.hg', '.svn', '.idea', '.vscode', '.vs',
  'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage',
  '.next', '.nuxt', '.output', '.turbo', '.cache', '.parcel-cache',
  'venv', '.venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache',
  '.gradle', '.mvn', 'vendor', 'Pods', 'DerivedData',
])

const MAX_ENTRIES = 20_000
const MAX_DEPTH = 12
const INDEX_TTL_MS = 60_000
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

interface IndexEntry {
  rel: string
  name: string
  kind: 'file' | 'directory'
}

interface Index {
  at: number
  truncated: boolean
  entries: IndexEntry[]
}

const indexes = new Map<string, Index>()

function build(projectPath: string): Index {
  const entries: IndexEntry[] = []
  const stack: { dir: string; rel: string; depth: number }[] = [{ dir: projectPath, rel: '', depth: 0 }]
  let truncated = false
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) break
    let dirents
    try {
      dirents = readdirSync(current.dir, { withFileTypes: true })
    } catch {
      continue /* unreadable directory: skip, never fail the whole search */
    }
    for (const dirent of dirents) {
      if (entries.length >= MAX_ENTRIES) {
        truncated = true
        break
      }
      const name = dirent.name
      const rel = current.rel === '' ? name : current.rel + '/' + name
      if (dirent.isDirectory()) {
        if (SKIP.has(name)) continue
        entries.push({ rel, name, kind: 'directory' })
        if (current.depth + 1 < MAX_DEPTH) stack.push({ dir: join(current.dir, name), rel, depth: current.depth + 1 })
        continue
      }
      if (dirent.isFile()) entries.push({ rel, name, kind: 'file' })
      /* Symlinks are neither followed (cycles) nor listed. */
    }
    if (truncated) break
  }
  return { at: Date.now(), truncated, entries }
}

function indexOf(projectPath: string): Index {
  const key = workspaceKey(projectPath)
  const cached = indexes.get(key)
  if (cached !== undefined && Date.now() - cached.at < INDEX_TTL_MS) return cached
  const built = build(projectPath)
  indexes.set(key, built)
  return built
}

function hit(projectPath: string, projectName: string, entry: IndexEntry, score: number): FileHit {
  return {
    path: projectPath + sep + entry.rel.split('/').join(sep),
    rel: entry.rel,
    name: entry.name,
    kind: entry.kind,
    project: projectName,
    projectPath,
    score,
  }
}

export interface ProjectRoot {
  path: string
  name: string
}

/**
 * Rank entries by NAME for the typed query. Names, not relative paths: a path hit
 * would drag a whole subtree into the menu, which is what the drill exists for.
 * Matching directories swallow their descendants, so `需求开发` lists that one
 * directory instead of everything below it.
 */
export function searchProjects(projects: ProjectRoot[], query: string, limit?: number): FileHit[] {
  const capped = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '')
  if (tokens.length === 0) return []
  const merged: FileHit[] = []
  for (const project of projects) {
    const hits: FileHit[] = []
    const matchedDirs: string[] = []
    for (const entry of indexOf(project.path).entries) {
      const name = entry.name.toLowerCase()
      let score = 0
      let matched = true
      for (const token of tokens) {
        const at = name.indexOf(token)
        if (at < 0) {
          matched = false
          break
        }
        /* Exact name beats a prefix, a prefix beats a substring. */
        score += name === token ? 1000 : (at === 0 ? 500 : 300)
      }
      if (matched !== true) continue
      /* A deeper entry under a matching directory is that directory's content:
         the user gets there by drilling, not by reading a flattened list. */
      if (matchedDirs.some((dir) => entry.rel.startsWith(dir + '/'))) continue
      if (entry.kind === 'directory') matchedDirs.push(entry.rel)
      hits.push(hit(project.path, project.name, entry, score))
    }
    hits.sort((left, right) => right.score - left.score || left.rel.localeCompare(right.rel))
    merged.push(...hits.slice(0, capped))
  }
  merged.sort((left, right) => right.score - left.score || left.rel.localeCompare(right.rel))
  return merged.slice(0, capped)
}

/**
 * The direct children of one directory inside a project, for a drill step.
 * `filter` is the text typed after the last `/`: matched against the child NAME,
 * so typing a path narrows the level the user is standing in.
 */
export function listDirectory(
  projectPath: string,
  projectName: string,
  dir: string,
  filter: string,
  limit?: number,
): { rows: FileHit[]; truncated: boolean } {
  const capped = Math.min(Math.max(limit ?? MAX_LIMIT, 1), MAX_LIMIT)
  const root = projectPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const target = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const lowered = target.toLowerCase()
  if (lowered !== root.toLowerCase() && !lowered.startsWith(root.toLowerCase() + '/')) {
    return { rows: [], truncated: false }
  }
  const relDir = target.slice(root.length).replace(/^\/+/, '')
  let dirents
  try {
    dirents = readdirSync(target, { withFileTypes: true })
  } catch {
    return { rows: [], truncated: false }
  }
  const needle = filter.toLowerCase()
  const rows: FileHit[] = []
  /* Bucket by a coarse score so ranking works whether the filter is empty (0, a
     plain level listing) or narrowing. */
  const scored: (FileHit & { depth: number })[] = []
  for (const dirent of dirents) {
    const name = dirent.name
    const kind: 'file' | 'directory' | null = dirent.isDirectory()
      ? (SKIP.has(name) ? null : 'directory')
      : (dirent.isFile() ? 'file' : null)
    if (kind === null) continue
    if (needle !== '') {
      const at = name.toLowerCase().indexOf(needle)
      if (at < 0) continue
      const score = name.toLowerCase() === needle ? 1000 : (at === 0 ? 500 : 300)
      scored.push({ ...hit(projectPath, projectName, { rel: relDir === '' ? name : relDir + '/' + name, name, kind }, score), depth: kind === 'directory' ? 0 : 1 })
      continue
    }
    scored.push({ ...hit(projectPath, projectName, { rel: relDir === '' ? name : relDir + '/' + name, name, kind }, 0), depth: kind === 'directory' ? 0 : 1 })
  }
  /* Directories first (that is what a level listing looks like), then by name. */
  scored.sort((left, right) => right.score - left.score || left.depth - right.depth || left.name.localeCompare(right.name))
  for (const entry of scored) {
    if (rows.length >= capped) return { rows, truncated: true }
    const { depth: _depth, ...row } = entry
    rows.push(row)
  }
  return { rows, truncated: false }
}
