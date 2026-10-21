/**
 * Host entry: wiring only.
 *
 * Layers (each knows as little as it can):
 *   store.ts    persistence + validation rules (no framework, no HTTP)
 *   prompt.ts   the exact text the model reads
 *   context.ts  "which workspace am I in" and "what may I write"
 *   sessions.ts per-session prompt channels (section + one-shot notice)
 *   routes.ts   the JSON route the UI calls
 *   tool.ts     the agent-facing tool
 *   http.ts     request plumbing
 */
import { spawn } from 'node:child_process';
import { Registry, RegistryError } from './store.js';
import { isTrusted, readJsonBody, sendJson } from './http.js';
import { createHandlers } from './routes.js';
import { SessionRegistry } from './sessions.js';
import { createTool } from './tool.js';
export const name = 'related-projects';
export const inject = ['webServer'];
const ROUTE_PREFIX = '/related-projects/api';
function openInFileManager(target) {
    const command = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    try {
        const child = spawn(command, [target], { detached: true, stdio: 'ignore' });
        child.on('error', () => { });
        child.unref();
    }
    catch { /* ignore */ }
}
export function apply(ctx, config) {
    const dataFile = config !== undefined && typeof config.dataFile === 'string' && config.dataFile !== ''
        ? config.dataFile
        : undefined;
    const registry = new Registry(dataFile);
    const sessions = new SessionRegistry(ctx, registry);
    const handlers = createHandlers({ ctx, registry, sessions, openInFileManager });
    /* ------------------------------- route ------------------------------- */
    const handle = async (req, res) => {
        if (isTrusted(req) !== true) {
            sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
            return;
        }
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: { code: 'method', message: 'POST required' } });
            return;
        }
        const pathname = new URL(req.url === undefined ? '/' : req.url, 'http://dsh.internal').pathname;
        const method = pathname.startsWith(ROUTE_PREFIX + '/') ? pathname.slice(ROUTE_PREFIX.length + 1) : '';
        const handler = Object.prototype.hasOwnProperty.call(handlers, method) ? handlers[method] : undefined;
        if (handler === undefined || method.includes('/')) {
            sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method ' + method } });
            return;
        }
        try {
            const payload = await readJsonBody(req);
            sendJson(res, 200, { ok: true, data: await handler(payload) });
        }
        catch (error) {
            if (error instanceof RegistryError) {
                sendJson(res, 400, { ok: false, error: { code: error.code, message: error.code } });
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            sendJson(res, 500, { ok: false, error: { code: 'internal', message } });
        }
    };
    const webServer = ctx.get('webServer');
    if (webServer !== undefined && webServer !== null && typeof webServer.register === 'function') {
        ctx.effect(() => webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }), 'related-projects: routes');
    }
    /* -------------------------------- tool -------------------------------- */
    const tools = ctx.get('tools');
    if (tools !== undefined && tools !== null && typeof tools.register === 'function') {
        ctx.effect(() => tools.register(createTool(ctx, registry, sessions)), 'related-projects: tool');
    }
    /* ------------------------------ sessions ------------------------------ */
    if (typeof ctx.on === 'function') {
        ctx.on('agent/created', (data) => {
            sessions.attach(data?.agent);
        });
        ctx.on('agent/disposed', (data) => {
            sessions.detach(data?.agent);
        });
    }
    /* Sessions that already existed when the plugin (re)loaded — including the
       one running this very code. */
    try {
        const agents = ctx.get('agents');
        const list = agents !== undefined && typeof agents.list === 'function' ? agents.list() : null;
        if (list !== null)
            for (const agent of list)
                sessions.attach(agent);
    }
    catch { /* no live-agent registry on this host */ }
    ctx.effect(() => () => sessions.disposeAll(), 'related-projects: session cleanup');
}
