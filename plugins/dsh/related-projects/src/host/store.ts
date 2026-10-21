/**
 * Registry: persistence and the rules about what may be a related project.
 *
 * This layer knows nothing about Cordis, HTTP, or prompting; it is plain
 * filesystem + validation so it can be reasoned about (and tested) alone.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Group, GroupView, Limits, Project, ProjectView, RegistryErrorCode, Settings, Snapshot } from './types.js'

export const MAX_PROJECTS = 10
export const NOTE_MAX = 200
export const NAME_MAX = 60
export const STORE_VERSION = 1
export const FILE_NAME = 'related-projects.json'

export class RegistryError extends Error {
  readonly code: RegistryErrorCode

  constructor(code: RegistryErrorCode) {
    super(code)
    this.code = code
  }
}

/** The DSH data directory: `$DSH_HOME`, else `~/.dsh`. */
export function defaultDataFile(): string {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, FILE_NAME)
}

/** Absolute path without a trailing separator. */
export function normalizePath(input: unknown): string {
  const text = String(input ?? '').trim()
  if (text === '') return ''
  let resolved: string
  try { resolved = resolve(text) } catch { return '' }
  if (resolved.length > 3 && (resolved.endsWith(sep) || resolved.endsWith('/'))) resolved = resolved.slice(0, -1)
  return resolved
}

/** Grouping key: Windows paths fold case, all paths fold separators. */
export function workspaceKey(input: unknown): string {
  const normalized = normalizePath(input)
  if (normalized === '') return ''
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isDriveRoot(path: string): boolean {
  return path !== '' && parse(path).root.replace(/[\\/]+$/, '') === path.replace(/[\\/]+$/, '')
}

function isHome(path: string): boolean {
  return path !== '' && workspaceKey(path) === workspaceKey(homedir())
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, max)
}

function cleanName(value: unknown): string {
  return text(value, NAME_MAX).replace(/[\u0000-\u001f]/g, ' ').trim()
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter((part) => part !== '')
  return parts.length === 0 ? path : parts[parts.length - 1]
}

interface Document {
  version: number
  settings: Settings
  groups: Record<string, Group>
}

function emptyDocument(): Document {
  return { version: STORE_VERSION, settings: { alwaysShowDock: true }, groups: {} }
}

export interface AddInput {
  path: unknown
  name?: unknown
  note?: unknown
  origin?: unknown
}

export interface UpdateInput {
  name?: unknown
  note?: unknown
  enabled?: unknown
}

export class Registry {
  readonly limits: Limits = { max: MAX_PROJECTS, noteMax: NOTE_MAX, nameMax: NAME_MAX }
  private readonly file: string
  private document: Document = emptyDocument()
  private loaded = false

  constructor(file?: string) {
    this.file = file !== undefined && file !== '' ? file : defaultDataFile()
  }

  private load(): Document {
    if (this.loaded) return this.document
    this.loaded = true
    if (!existsSync(this.file)) return this.document
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Document>
      const document = emptyDocument()
      if (raw.settings !== undefined && typeof raw.settings.alwaysShowDock === 'boolean') {
        document.settings.alwaysShowDock = raw.settings.alwaysShowDock
      }
      for (const [key, group] of Object.entries(raw.groups ?? {})) {
        if (group === null || typeof group !== 'object' || !Array.isArray(group.projects)) continue
        const projects: Project[] = []
        for (const project of group.projects) {
          if (project === null || typeof project !== 'object' || typeof project.path !== 'string') continue
          projects.push({
            id: typeof project.id === 'string' && project.id !== '' ? project.id : randomUUID(),
            path: project.path,
            name: cleanName(project.name === undefined || project.name === '' ? baseName(project.path) : project.name),
            note: text(project.note, NOTE_MAX),
            enabled: project.enabled !== false,
            origin: project.origin === 'agent' ? 'agent' : 'user',
            createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
          })
        }
        document.groups[key] = {
          key,
          path: typeof group.path === 'string' && group.path !== '' ? group.path : key,
          updatedAt: typeof group.updatedAt === 'number' ? group.updatedAt : 0,
          projects,
        }
      }
      this.document = document
    } catch {
      /* A corrupt document must not brick the plugin: keep an empty registry in
         memory and let the next write replace the file. */
    }
    return this.document
  }

  private persist(): void {
    const directory = dirname(this.file)
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    const temporary = this.file + '.tmp-' + String(process.pid)
    writeFileSync(temporary, JSON.stringify(this.document, null, 2), 'utf8')
    renameSync(temporary, this.file)
  }

  /* ------------------------------ settings ------------------------------ */

  getSettings(): Settings {
    return { ...this.load().settings }
  }

  setSettings(patch: unknown): Settings {
    const document = this.load()
    if (patch !== null && typeof patch === 'object' && typeof (patch as Settings).alwaysShowDock === 'boolean') {
      document.settings.alwaysShowDock = (patch as Settings).alwaysShowDock
    }
    this.persist()
    return this.getSettings()
  }

  /* ------------------------------- groups ------------------------------- */

  groupFor(workspace: unknown): Group | null {
    const key = workspaceKey(workspace)
    if (key === '') return null
    return this.load().groups[key] ?? null
  }

  ensureGroup(path: unknown): GroupView {
    const document = this.load()
    const resolved = normalizePath(path)
    if (resolved === '' || !isDirectory(resolved)) throw new RegistryError('not-directory')
    const key = workspaceKey(resolved)
    let group = document.groups[key]
    if (group === undefined) {
      group = { key, path: resolved, updatedAt: Date.now(), projects: [] }
      document.groups[key] = group
      this.persist()
    }
    return this.presentGroup(group)
  }

  groups(): GroupView[] {
    return Object.values(this.load().groups)
      .map((group) => this.presentGroup(group))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  }

  /* ------------------------------ projects ------------------------------ */

  private assertCandidate(candidatePath: string, workspace: string): void {
    if (candidatePath === '' || !isDirectory(candidatePath)) throw new RegistryError('not-directory')
    if (isDriveRoot(candidatePath)) throw new RegistryError('root')
    if (isHome(candidatePath)) throw new RegistryError('home')
    if (workspaceKey(candidatePath) === workspaceKey(workspace)) throw new RegistryError('self')
  }

  add(workspace: unknown, input: AddInput): ProjectView {
    const document = this.load()
    const workspacePath = normalizePath(workspace)
    if (workspacePath === '' || !isDirectory(workspacePath)) throw new RegistryError('workspace-missing')
    const candidatePath = normalizePath(input.path)
    this.assertCandidate(candidatePath, workspacePath)

    const key = workspaceKey(workspacePath)
    let group = document.groups[key]
    if (group === undefined) {
      group = { key, path: workspacePath, updatedAt: Date.now(), projects: [] }
      document.groups[key] = group
    }
    /* Same directory twice is a no-op, not an error: the UI and the agent both
       retry the same intent. */
    const duplicate = group.projects.find((project) => workspaceKey(project.path) === workspaceKey(candidatePath))
    if (duplicate !== undefined) return this.presentProject(duplicate)
    if (group.projects.length >= MAX_PROJECTS) throw new RegistryError('limit')

    const name = cleanName(input.name === undefined || input.name === '' ? baseName(candidatePath) : input.name)
    const project: Project = {
      id: randomUUID(),
      path: candidatePath,
      name: name === '' ? baseName(candidatePath) : name,
      note: text(input.note, NOTE_MAX),
      enabled: true,
      origin: input.origin === 'agent' ? 'agent' : 'user',
      createdAt: Date.now(),
    }
    group.projects.push(project)
    group.updatedAt = Date.now()
    this.persist()
    return this.presentProject(project)
  }

  update(workspace: unknown, id: unknown, patch: unknown): ProjectView {
    const group = this.groupFor(workspace)
    if (group === null) throw new RegistryError('no-group')
    const project = group.projects.find((entry) => entry.id === id)
    if (project === undefined) throw new RegistryError('no-project')
    const body = (patch ?? {}) as UpdateInput
    if (typeof body.name === 'string') {
      const name = cleanName(body.name)
      if (name !== '') project.name = name
    }
    if (typeof body.note === 'string') project.note = text(body.note, NOTE_MAX)
    if (typeof body.enabled === 'boolean') project.enabled = body.enabled
    group.updatedAt = Date.now()
    this.persist()
    return this.presentProject(project)
  }

  remove(workspace: unknown, id: unknown): { removed: boolean; name: string } {
    const document = this.load()
    const group = this.groupFor(workspace)
    if (group === null) throw new RegistryError('no-group')
    const index = group.projects.findIndex((entry) => entry.id === id)
    if (index < 0) throw new RegistryError('no-project')
    const [removed] = group.projects.splice(index, 1)
    group.updatedAt = Date.now()
    if (group.projects.length === 0) delete document.groups[group.key]
    this.persist()
    return { removed: true, name: removed.name }
  }

  copy(from: unknown, to: unknown): { added: number; skipped: number; group: GroupView } {
    const document = this.load()
    const source = this.groupFor(from)
    if (source === null) throw new RegistryError('no-group')
    const targetPath = normalizePath(to)
    if (targetPath === '') throw new RegistryError('not-directory')
    this.ensureGroup(targetPath)
    const target = document.groups[workspaceKey(targetPath)]
    let added = 0
    let skipped = 0
    for (const project of source.projects) {
      if (target.projects.some((entry) => workspaceKey(entry.path) === workspaceKey(project.path))) { skipped += 1; continue }
      if (target.projects.length >= MAX_PROJECTS) { skipped += 1; continue }
      target.projects.push({
        id: randomUUID(),
        path: project.path,
        name: project.name,
        note: project.note,
        enabled: project.enabled,
        origin: 'user',
        createdAt: Date.now(),
      })
      added += 1
    }
    target.updatedAt = Date.now()
    this.persist()
    return { added, skipped, group: this.presentGroup(target) }
  }

  /* ------------------------------ views ------------------------------ */

  presentProject(project: Project): ProjectView {
    return {
      id: project.id,
      path: project.path,
      name: project.name,
      note: project.note,
      enabled: project.enabled !== false,
      origin: project.origin === 'agent' ? 'agent' : 'user',
      exists: isDirectory(project.path),
    }
  }

  presentGroup(group: Group): GroupView {
    return {
      key: group.key,
      path: group.path,
      updatedAt: group.updatedAt,
      projects: group.projects.map((project) => this.presentProject(project)),
    }
  }

  snapshot(workspace: unknown): Snapshot {
    const path = normalizePath(workspace)
    const group = path === '' ? null : this.groupFor(path)
    const present = group === null ? null : this.presentGroup(group)
    return {
      settings: this.getSettings(),
      workspace: present === null ? null : { key: present.key, path: present.path },
      projects: present === null ? [] : present.projects,
      groups: this.groups(),
      limits: { ...this.limits },
    }
  }
}
