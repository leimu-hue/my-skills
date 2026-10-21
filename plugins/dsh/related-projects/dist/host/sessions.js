/**
 * Per-session prompt channels, both cache-friendly:
 *
 *  - `section`: the frozen project list, rendered ONCE per session. A stable head
 *    is what keeps the provider's prefix cache valid, so the section must never
 *    change mid-session; a change arrives as a notice instead.
 *  - `notice`: an APPEND-ONLY snapshot describing one change. Each change
 *    registers a NEW context name carrying STATIC text, so DSH appends it at the
 *    tail of the history once and never rewrites it afterwards. The cached prefix
 *    (system prompt + everything before the notice) stays reusable — the whole
 *    point of not touching the section.
 *
 * Why the notice is not a one-shot `text()` provider any more: one model step
 * reads a context provider TWICE — `assemble()` first, then `refreshContext()`
 * after `agent/pre-step`. The previous implementation marked itself served on the
 * FIRST read, so the second read returned '' and the notice never reached the
 * request (verified against an exported session: the notice text appears zero
 * times). Static text has no such read-order hazard.
 *
 * Tangible cost per change: the notice's own tokens, appended once. Everything
 * before it stays cached.
 */
import { sectionText, NOTICE_NAME, NOTICE_ORDER, SECTION_NAME, SECTION_ORDER, changeNotice } from './prompt.js';
import { sandboxFactOf, workspaceOfAgent } from './context.js';
import { workspaceKey } from './store.js';
export const TOOL_NAME = 'related_projects';
export class SessionRegistry {
    ctx;
    registry;
    entries = new Map();
    notices = 0;
    constructor(ctx, registry) {
        this.ctx = ctx;
        this.registry = registry;
    }
    get size() {
        return this.entries.size;
    }
    /** Diagnostics for `/prompt`: is this session actually wired up? */
    describe(sessionId) {
        const entry = this.entries.get(sessionId);
        if (entry === undefined)
            return { attached: false, section: 'no-session', notices: 0 };
        return {
            attached: true,
            section: entry.sectionError !== undefined ? 'failed: ' + entry.sectionError : entry.sectionOn,
            notices: entry.notices.length,
        };
    }
    sessionsOf(workspace) {
        const key = workspaceKey(workspace);
        const ids = [];
        for (const [id, entry] of this.entries)
            if (entry.key === key)
                ids.push(id);
        return ids;
    }
    attach(agent) {
        if (agent === undefined || agent === null)
            return;
        const id = String(agent.id);
        if (this.entries.has(id))
            return;
        const workspace = workspaceOfAgent(this.ctx, agent);
        if (workspace === '')
            return;
        const promptCtx = agent.ctx;
        if (promptCtx === undefined)
            return;
        const entry = { agent, workspace, key: workspaceKey(workspace), notices: [], sectionOn: 'pending' };
        const service = this.promptService(promptCtx);
        if (service === undefined) {
            entry.sectionOn = 'none';
            entry.sectionError = 'systemPrompt unavailable';
            this.entries.set(id, entry);
            return;
        }
        /* Frozen on first render and reused afterwards: a stable head is what keeps
           the provider's prefix cache valid for the whole session. Changes go out as
           append-only notices instead of rewriting this node. */
        let rendered = null;
        const text = () => {
            if (rendered === null)
                rendered = sectionText(this.registry, workspace, this.boundary(agent));
            return rendered;
        };
        try {
            entry.disposeSection = promptCtx.effect(() => service.section({
                name: SECTION_NAME,
                order: SECTION_ORDER,
                text,
                interpolate: false,
            }), 'related-projects: session section');
            entry.sectionOn = 'agent';
        }
        catch (failure) {
            entry.sectionOn = 'none';
            entry.sectionError = failure instanceof Error ? failure.message : String(failure);
        }
        this.entries.set(id, entry);
    }
    detach(agent) {
        if (agent === undefined || agent === null)
            return;
        const id = String(agent.id);
        const entry = this.entries.get(id);
        if (entry === undefined)
            return;
        this.entries.delete(id);
        try {
            entry.disposeSection?.();
        }
        catch { /* already gone */ }
        for (const dispose of entry.notices) {
            try {
                dispose();
            }
            catch { /* already gone */ }
        }
    }
    /**
     * Append one change snapshot to every live session of this workspace.
     *
     * The snapshot carries STATIC text under a fresh name, so it enters the history
     * once as a tail node: no head rewrite, no repeated delivery. A session that is
     * not live needs nothing — its section renders from the registry when it next
     * starts.
     */
    notify(workspace, summary) {
        const key = workspaceKey(workspace);
        let delivered = 0;
        for (const entry of this.entries.values()) {
            if (entry.key !== key)
                continue;
            const promptCtx = entry.agent.ctx;
            if (promptCtx === undefined)
                continue;
            const service = this.promptService(promptCtx);
            if (service === undefined || typeof service.context !== 'function')
                continue;
            const context = service.context;
            const text = changeNotice(summary, sectionText(this.registry, entry.workspace, this.boundary(entry.agent)));
            /* A unique name per change is what makes the notice append instead of
               replacing an earlier snapshot in place (a replacement would invalidate
               the prefix from its old position). */
            this.notices += 1;
            const name = NOTICE_NAME + '-' + String(Date.now()) + '-' + String(this.notices);
            try {
                const dispose = promptCtx.effect(() => context.call(service, {
                    name,
                    order: NOTICE_ORDER,
                    text,
                    interpolate: false,
                }) ?? (() => { }), 'related-projects: change notice');
                entry.notices.push(dispose);
                delivered += 1;
            }
            catch {
                /* A taken name (stale generation) must not abort the other sessions. */
            }
        }
        return { delivered };
    }
    disposeAll() {
        for (const entry of this.entries.values()) {
            try {
                entry.disposeSection?.();
            }
            catch { /* ignore */ }
            for (const dispose of entry.notices) {
                try {
                    dispose();
                }
                catch { /* ignore */ }
            }
        }
        this.entries.clear();
    }
    promptService(scope) {
        try {
            const value = scope.get('systemPrompt');
            return value === undefined || value === null ? undefined : value;
        }
        catch {
            return undefined;
        }
    }
    boundary(agent) {
        const fact = sandboxFactOf(this.ctx, agent.session);
        if (fact === null)
            return 'unknown';
        return fact.mode === 'danger-full-access'
            ? 'danger-full-access (no path restriction)'
            : (fact.mode === 'read-only'
                ? 'read-only (no writes)'
                : 'workspace-write (only ' + fact.workspaceRoot + ' is writable; writes elsewhere need approval)');
    }
}
