/**
 * Everything the model reads. Kept apart from the registry and the transport so
 * the wording can change without touching either.
 */
import type { Registry } from './store.js'
import type { ProjectView } from './types.js'

export const SECTION_NAME = 'related-projects'
export const NOTICE_NAME = 'related-projects-changed'
export const SECTION_ORDER = 900
export const NOTICE_ORDER = 910

export interface SandboxFact {
  mode: string
  workspaceRoot: string
}

/** The write boundary as one clause; it comes from the live sandbox policy. */
export function boundaryText(fact: SandboxFact | null): string {
  if (fact === null) return 'unknown'
  if (fact.mode === 'danger-full-access') return 'danger-full-access (no path restriction)'
  if (fact.mode === 'read-only') return 'read-only (no writes)'
  return 'workspace-write (only ' + fact.workspaceRoot + ' is writable; writes elsewhere need approval)'
}

/**
 * The session's prompt section. Rendered once per session and then frozen: a
 * stable prefix keeps the provider's prompt cache valid, so later registry
 * changes arrive as a one-shot runtime-context notice instead.
 *
 * Nothing usable means an empty string — a section announcing "0 related
 * projects" is noise in every session of every unconfigured workspace.
 */
export function sectionText(registry: Registry, workspace: string, boundary: string): string {
  const snapshot = registry.snapshot(workspace)
  const usable = snapshot.projects.filter((project) => project.enabled !== false && project.exists !== false)
  if (usable.length === 0) return ''
  const unavailable = snapshot.projects.filter((project) => project.enabled !== false && project.exists === false)

  const lines: string[] = [
    '## Related projects',
    '',
    'The workspace groups ' + String(usable.length) + ' related project(s) that a change here usually touches '
      + '(for example the frontend, the docs, or a sibling service). Treat them as in scope when the request '
      + 'plausibly involves them, and read them directly instead of asking the user for a path.',
    '',
    'Write scope for this session: ' + boundary + '.',
    '',
  ]
  for (const project of usable) {
    lines.push(line(project))
  }
  if (unavailable.length > 0) {
    lines.push('')
    lines.push(String(unavailable.length) + ' further related project(s) are currently unavailable (their path is '
      + 'missing); they are omitted on purpose — do not guess their content.')
  }
  return lines.join('\n')
}

function line(project: ProjectView): string {
  const note = project.note === '' ? '' : ' — when to touch: ' + project.note.replace(/\s+/g, ' ').trim()
  return '- ' + project.name + ' — ' + project.path + note
}

/** One-shot notice for a mid-session registry change. */
export function noticeText(summary: string, toolName: string): string {
  return 'Related projects changed for this workspace: ' + summary + '. '
    + 'The project list in your system prompt is the set this session started with; '
    + 'call ' + toolName + '(action="list") for the current one.'
}
