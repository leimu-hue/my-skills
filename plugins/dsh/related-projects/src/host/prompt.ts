/**
 * Everything the model reads. Kept apart from the registry and the transport so
 * the wording can change without touching either.
 */
import type { Registry } from './store.js'
import type { ProjectView } from './types.js'

export const SECTION_NAME = 'related-projects'
export const SECTION_ORDER = 900
export const NOTICE_NAME = 'related-projects-changed'
export const NOTICE_ORDER = 910

export interface SandboxFact {
  mode: string
  workspaceRoot: string
}

/**
 * The write boundary as one clause; it comes from the sandbox policy. The
 * workspace root is deliberately not repeated: the session's working directory
 * already states it, and `workspace-write` is bounded by that directory.
 */
export function boundaryText(fact: SandboxFact | null): string {
  if (fact === null) return 'unknown'
  if (fact.mode === 'danger-full-access') return 'danger-full-access (no path restriction)'
  if (fact.mode === 'read-only') return 'read-only (no writes)'
  return 'workspace-write (writes outside the working directory need approval)'
}

interface Projects {
  usable: ProjectView[]
  unavailable: ProjectView[]
}

function projectsOf(registry: Registry, workspace: string): Projects {
  const snapshot = registry.snapshot(workspace)
  const enabled = snapshot.projects.filter((project) => project.enabled !== false)
  return {
    usable: enabled.filter((project) => project.exists !== false),
    unavailable: enabled.filter((project) => project.exists === false),
  }
}

/**
 * The session's prompt section, rendered ONCE per session and then frozen.
 *
 * Freezing is a cache decision, not laziness: the section lives inside the single
 * system-prompt node, so re-rendering it after any registry change would rewrite
 * that node and throw away the cached prefix for the whole conversation. Changes
 * travel as append-only notices instead (see sessions.ts).
 *
 * Nothing usable means an empty string — a section announcing "0 related
 * projects" is noise in every session of every unconfigured workspace.
 */
export function sectionText(registry: Registry, workspace: string, boundary: string): string {
  const { usable, unavailable } = projectsOf(registry, workspace)
  if (usable.length === 0) return ''

  const lines: string[] = [
    '## Related projects (' + String(usable.length) + ')',
    '',
    'Sibling repositories that a change here usually touches. Treat them as in scope when the request '
      + 'plausibly involves them; read them directly instead of asking for a path.',
    '',
    'Write scope: ' + boundary + '.',
    '',
  ]
  for (const project of usable) lines.push(line(project))
  appendUnavailable(lines, unavailable)
  return lines.join('\n')
}

/**
 * The rows of the CURRENT list, without the section's instructions or write
 * boundary. A notice already has its own lead-in, and the frozen section still
 * carries the instructions, so repeating them in every notice is pure
 * per-request overhead.
 */
export function listText(registry: Registry, workspace: string): string {
  const { usable, unavailable } = projectsOf(registry, workspace)
  if (usable.length === 0) return ''
  const lines = usable.map(line)
  appendUnavailable(lines, unavailable)
  return lines.join('\n')
}

function appendUnavailable(lines: string[], unavailable: ProjectView[]): void {
  if (unavailable.length === 0) return
  lines.push('')
  lines.push(unavailable.length === 1
    ? '1 related project is unavailable (path missing); omitted — do not guess its content.'
    : String(unavailable.length) + ' related projects are unavailable (path missing); omitted — do not guess their content.')
}

function line(project: ProjectView): string {
  const note = project.note === '' ? '' : ' — ' + project.note.replace(/\s+/g, ' ').trim()
  return '- ' + project.name + ' — ' + project.path + note
}

/**
 * One change, as an append-only snapshot for the conversation history.
 *
 * It carries the CURRENT list, so the model never has to guess whether the frozen
 * section is still true, and it says what changed so a note edit is unambiguous.
 * The text is static: repeated assemblies render the identical string, which is
 * what keeps it from being rewritten (and re-charged) later.
 */
export function changeNotice(summary: string, current: string): string {
  const head = 'Related projects changed: ' + summary + '. '
  if (current === '') {
    return head + 'No usable related projects remain; ignore every earlier list, including earlier notices.'
  }
  return head + 'Current list (supersedes the system prompt and earlier notices):\n\n' + current
}
