/** Shared types for the Host half. */

export interface Project {
  id: string
  path: string
  name: string
  /** When this project needs a change, free text. */
  note: string
  enabled: boolean
  origin: 'user' | 'agent'
  createdAt: number
}

/** A project as the UI sees it: plus whether the directory still exists. */
export interface ProjectView extends Omit<Project, 'createdAt'> {
  exists: boolean
}

export interface Group {
  key: string
  path: string
  updatedAt: number
  projects: Project[]
}

export interface GroupView {
  key: string
  path: string
  updatedAt: number
  projects: ProjectView[]
}

export interface Settings {
  alwaysShowDock: boolean
}

export interface Limits {
  max: number
  noteMax: number
  nameMax: number
}

/** One section of the management panel: a DSH workspace, registered or not. */
export interface WorkspaceRow {
  key: string
  path: string
  title: string | null
  /** False when the group outlived a workspace that DSH no longer lists. */
  registered: boolean
  projects: ProjectView[]
}

export interface Snapshot {
  settings: Settings
  workspace: { key: string; path: string } | null
  projects: ProjectView[]
  groups: GroupView[]
  limits: Limits
}

export interface StateValue extends Snapshot {
  workspaces: WorkspaceRow[]
}

/** Error codes the routes translate into HTTP failures. */
export type RegistryErrorCode =
  | 'not-directory'
  | 'root'
  | 'home'
  | 'self'
  | 'limit'
  | 'no-group'
  | 'no-project'
  | 'workspace-missing'
  | 'bad-json'
  | 'too-large'
  | 'transport'
  | 'pick-unavailable'
  | 'internal'
