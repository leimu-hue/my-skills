/**
 * `whistle_session`：一条抓包记录的全貌。
 *
 * 列表工具只给摘要，正文在这里按需取：JSON 顺手美化、超长截断、请求头和响应头
 * 可以关掉。WebSocket 会话的正文在帧里，这里只提示去用 `whistle_frames`。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { WhistleError, asToolFailure } from "../shared/errors.js";
import { bodyOf, clockOf, durationOf, headerLines, prettyBody, sizeText } from "../whistle/format.js";
import { findSession } from "../whistle/query.js";
export const SESSION_TOOL = 'whistle_session';
const DEFAULT_BODY_LIMIT = 4000;
export function createSessionTool(client) {
    return defineTool({
        name: SESSION_TOOL,
        description: 'Read one captured request in full: url, status, timings, matched rules, request/response headers and '
            + 'bodies (JSON pretty-printed, truncated to bodyLimit). Take the id from whistle_sessions. For a WebSocket '
            + 'session the payload is in frames — call whistle_frames with this same id as reqId.',
        parameters: {
            id: { type: 'string', required: true, description: 'Session id from whistle_sessions, e.g. "1784905385300-003".' },
            bodyLimit: { type: 'number', description: 'Max characters per body; 0 means no limit (default 4000).' },
            headers: { type: 'boolean', description: 'Include request/response headers (default true).' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const id = args.id.trim();
            const bodyLimit = typeof args.bodyLimit === 'number' && Number.isFinite(args.bodyLimit)
                ? Math.max(Math.floor(args.bodyLimit), 0)
                : DEFAULT_BODY_LIMIT;
            try {
                return await client.call('read session ' + id, async (api) => {
                    const session = await findSession(api, id);
                    if (session === null) {
                        throw new WhistleError('not-found', 'No captured session with id ' + id + '.', 'Whistle keeps only recent traffic (120 records per page). Confirm the id with whistle_sessions, then '
                            + 'retry with an id from that listing.');
                    }
                    return renderSession(api, session, { bodyLimit, headers: args.headers !== false });
                }, { signal: exec.signal });
            }
            catch (cause) {
                throw asToolFailure(cause);
            }
        },
    });
}
function renderSession(api, session, options) {
    const lines = [];
    const method = (session.req?.method ?? session.method ?? '-').toUpperCase();
    const status = typeof session.res?.statusCode === 'number' ? String(session.res.statusCode) : '-';
    const statusMessage = typeof session.res?.statusMessage === 'string' ? session.res.statusMessage : '';
    const total = durationOf(api, session);
    lines.push('id: ' + String(session.id));
    lines.push('url: ' + String(session.url ?? '-'));
    lines.push([
        method + ' ' + status + (statusMessage === '' ? '' : ' ' + statusMessage),
        sizeText(session.res?.size),
        total === null ? '-ms' : total + 'ms',
        session.isHttps === true ? 'https' : 'http',
        'started ' + clockOf(session.startTime),
    ].join('  ·  '));
    const rules = matchedRules(api, session);
    if (rules.length > 0) {
        lines.push('matched rules:');
        for (const rule of rules)
            lines.push('  ' + rule);
    }
    if (session.res === undefined) {
        lines.push('');
        lines.push('No response recorded yet: the request is still pending, was aborted, or is a tunnel.');
    }
    if (options.headers) {
        pushSection(lines, 'request headers', headerLines(session.req?.headers));
        pushSection(lines, 'response headers', headerLines(session.res?.headers));
    }
    const requestType = contentTypeOf(session, 'req');
    const responseType = contentTypeOf(session, 'res');
    pushSection(lines, 'request body' + requestType, prettyBody(bodyOf(api, session, 'req'), options.bodyLimit));
    pushSection(lines, 'response body' + responseType, prettyBody(bodyOf(api, session, 'res'), options.bodyLimit));
    return lines.join('\n');
}
function pushSection(lines, title, content) {
    lines.push('');
    lines.push('── ' + title + ' ──');
    if (typeof content === 'string') {
        for (const line of content.split('\n'))
            lines.push(line);
        return;
    }
    if (content.length === 0) {
        lines.push('(none)');
        return;
    }
    for (const line of content)
        lines.push(line);
}
function contentTypeOf(session, side) {
    const headers = (side === 'req' ? session.req : session.res)?.headers;
    const raw = headers?.['content-type'];
    const text = Array.isArray(raw) ? raw.join(', ') : raw;
    if (typeof text !== 'string' || text === '')
        return '';
    const type = text.split(';')[0].trim();
    return type === '' ? '' : ' (' + type + ')';
}
function matchedRules(api, session) {
    try {
        const rules = api.utils.getRules(session);
        return Array.isArray(rules) ? rules : [];
    }
    catch {
        return [];
    }
}
