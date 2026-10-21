/**
 * Per-session prompt channels.
 *
 * Two distinct channels, deliberately separate:
 *  - `section`: the frozen project list, registered once when the agent is
 *    created (or when the plugin loads for an agent that already exists).
 *  - `notice`: a one-shot "the registry moved" line, registered once and merely
 *    re-armed on change. Registering it per change would throw, because a
 *    disposer does not take effect synchronously and prompt context names are
 *    unique per scope.
 *
 * Neither channel writes into the message inbox: an inbox message becomes a
 * visible user bubble, which would put words in the user's mouth.
 */
import { workspaceKey } from './store.js'
import { NOTICE_NAME, NOTICE_ORDER, SECTION_NAME, SECTION_ORDER, noticeText, sectionText } from './prompt.js'
import { sandboxFactOf, workspaceOfAgent } from './context.js'
import type { AgentLike, HostContext, ServiceBag } from './context.js'
import type { Registry } from './store.js'

export const TOOL_NAME = 'related_projects'

interface PromptService extends ServiceBag {
  section(section: { name: string; order: number; text: () => string; interpolate?: boolean }): () => void
  context?(context: { name: string; order: number; text: () => string; interpolate?: boolean }): () => void
}

interface NoticeState {
  text: string
  served: boolean
}

interface Entry {
  agent: AgentLike
  workspace: string
  key: string
  disposeSection?: () => void
  notice?: NoticeState
  sectionOn: 'agent' | 'none' | 'pending'
  sectionError?: string
  /** Which scoped name this session's notice landed on (see attach). */
  noticeName?: string
}

export interface NotifyResult {
  delivered: number
  error: string
}

export class SessionRegistry {
  private readonly ctx: HostContext
  private readonly registry: Registry
  private readonly entries = new Map<string, Entry>()

  constructor(ctx: HostContext, registry: Registry) {
    this.ctx = ctx
    this.registry = registry
  }

  get size(): number {
    return this.entries.size
  }

  /** Diagnostics for `/prompt`: is this session actually wired up? */
  describe(sessionId: string): { attached: boolean; section: string; notice: string } {
    const entry = this.entries.get(sessionId)
    if (entry === undefined) return { attached: false, section: 'no-session', notice: 'no-session' }
    const section = entry.sectionError !== undefined ? 'failed: ' + entry.sectionError : entry.sectionOn
    const notice = entry.notice === undefined ? 'unavailable' : 'ok' + (entry.noticeName === undefined ? '' : ':' + entry.noticeName)
    return { attached: true, section, notice }
  }

  attach(agent: AgentLike | undefined): void {
    if (agent === undefined || agent === null) return
    const id = String(agent.id)
    if (this.entries.has(id)) return
    const workspace = workspaceOfAgent(this.ctx, agent)
    if (workspace === '') return
    const promptCtx = agent.ctx
    if (promptCtx === undefined) return

    const entry: Entry = { agent, workspace, key: workspaceKey(workspace), sectionOn: 'pending' }
    const service = this.promptService(promptCtx)
    if (service === undefined) {
      entry.sectionOn = 'none'
      entry.sectionError = 'systemPrompt unavailable'
      this.entries.set(id, entry)
      return
    }

    /* Frozen on first render and reused afterwards: a stable prefix keeps the
       provider's prompt cache valid for the whole session. */
    let rendered: string | null = null
    const text = (): string => {
      if (rendered === null) rendered = sectionText(this.registry, workspace, this.boundary(agent))
      return rendered
    }

    try {
      entry.disposeSection = promptCtx.effect(() => service.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text,
        interpolate: false,
      }), 'related-projects: session section')
      entry.sectionOn = 'agent'
    } catch (failure) {
      entry.sectionOn = 'none'
      entry.sectionError = failure instanceof Error ? failure.message : String(failure)
    }

    /* The notice channel is registered separately and tolerantly: prompt context
       names are unique per scope, and a previous module generation's registration
       may still be alive on this agent after a hot reload. Its text provider is
       already spent (it returns ''), so leaving it there costs nothing — but the
       new one needs a free name. */
    if (typeof service.context === 'function') {
      const notice: NoticeState = { text: '', served: true }
      entry.notice = notice
      const provider = (name: string) => service.context?.({
        name,
        order: NOTICE_ORDER,
        interpolate: false,
        text: () => {
          if (notice.served === true || notice.text === '') return ''
          notice.served = true
          return notice.text
        },
      })
      for (let generation = 0; generation < 8; generation += 1) {
        const name = generation === 0 ? NOTICE_NAME : NOTICE_NAME + '-' + String(generation)
        try {
          promptCtx.effect(() => provider(name) ?? (() => {}), 'related-projects: notice channel')
          entry.noticeName = name
          break
        } catch {
          /* name taken by a dead generation: try the next one */
        }
      }
      if (entry.noticeName === undefined) entry.notice = undefined
    }

    this.entries.set(id, entry)
  }

  detach(agent: AgentLike | undefined): void {
    if (agent === undefined || agent === null) return
    const id = String(agent.id)
    const entry = this.entries.get(id)
    if (entry === undefined) return
    this.entries.delete(id)
    try { entry.disposeSection?.() } catch { /* already gone */ }
  }

  /** Re-arm every live session of one workspace. */
  notify(workspace: string, summary: string): NotifyResult {
    const key = workspaceKey(workspace)
    const text = noticeText(summary, TOOL_NAME)
    let delivered = 0
    let error = ''
    for (const entry of this.entries.values()) {
      if (entry.key !== key) continue
      const notice = entry.notice
      if (notice === undefined) { error = 'notice channel unavailable for this session'; continue }
      notice.text = text
      notice.served = false
      delivered += 1
    }
    return { delivered, error }
  }

  disposeAll(): void {
    for (const entry of this.entries.values()) {
      try { entry.disposeSection?.() } catch { /* ignore */ }
    }
    this.entries.clear()
  }

  private promptService(scope: ServiceBag): PromptService | undefined {
    try {
      const value = scope.get('systemPrompt')
      return value === undefined || value === null ? undefined : value as PromptService
    } catch {
      return undefined
    }
  }

  private boundary(agent: AgentLike): string {
    const fact = sandboxFactOf(this.ctx, agent.session)
    if (fact === null) return 'unknown'
    return fact.mode === 'danger-full-access'
      ? 'danger-full-access (no path restriction)'
      : (fact.mode === 'read-only'
        ? 'read-only (no writes)'
        : 'workspace-write (only ' + fact.workspaceRoot + ' is writable; writes elsewhere need approval)')
  }
}
