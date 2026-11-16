/**
 * `whistle_sessions`：按条件翻抓包记录。
 *
 * 这里刻意只返回「一行一条」的摘要 —— 正文由 `whistle_session` 单独取，
 * 否则一次查询就会把几十个响应体灌进上下文。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { asToolFailure } from "../shared/errors.js";
import { clampCount, collectSessions, parseHeaderFilter } from "../whistle/query.js";
import { sessionLine, sessionTableHeader } from "../whistle/format.js";
export const SESSIONS_TOOL = 'whistle_sessions';
const RESOURCE_TYPES = [
    'JSON',
    'HTML',
    'CSS',
    'JS',
    'Font',
    'Img',
    'Media',
    'WS',
    'SSE',
    'Tunnel',
    'Wasm',
    'Mock',
    'Rules',
    'Import',
    'Composer',
    'Error',
    'captureError',
];
export function createSessionsTool(client) {
    return defineTool({
        name: SESSIONS_TOOL,
        description: 'List captured requests from the local Whistle proxy, newest page first. Filters are ANDed; method and '
            + 'statusCode accept comma-separated alternatives. Returns one summary line per request (id, time, method, status, '
            + 'size, duration, url) — pass an id to whistle_session for headers and bodies, or to whistle_frames for WebSocket '
            + 'frames. Without a startId/startTime you see the most recent window Whistle keeps (120 records per page).',
        parameters: {
            latest: { type: 'boolean', description: 'Ask Whistle for the newest page and ignore progress; default false.' },
            count: { type: 'number', description: 'How many rows to return, 1-200 (default 30).' },
            type: {
                type: 'string',
                enum: [...RESOURCE_TYPES],
                description: 'Resource type filter, same as the Network tab filter bar.',
            },
            subUrl: { type: 'string', description: 'Case-insensitive substring the url must contain, e.g. "/api/user".' },
            method: { type: 'string', description: 'HTTP method(s), comma separated: "GET" or "GET,POST".' },
            statusCode: { type: 'string', description: 'Response status code(s), comma separated: "200,304".' },
            reqHeader: { type: 'string', description: 'Request header filter: "x-token" (must exist) or "x-token=abc" (must contain abc).' },
            resHeader: { type: 'string', description: 'Response header filter, same syntax as reqHeader.' },
            startId: { type: 'string', description: 'Cursor: only records after this id (use the last row of a previous call).' },
            startTime: { type: 'number', description: 'Cursor: only records started after this epoch millisecond.' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const limit = clampCount(args.count, 30, 200);
            const options = {};
            if (args.latest === true)
                options.latest = true;
            if (args.type !== undefined)
                options.type = args.type;
            if (typeof args.subUrl === 'string' && args.subUrl.trim() !== '')
                options.subUrl = args.subUrl.trim();
            if (typeof args.method === 'string' && args.method.trim() !== '')
                options.method = args.method.trim();
            if (typeof args.statusCode === 'string' && args.statusCode.trim() !== '')
                options.statusCode = args.statusCode.trim();
            const reqHeader = typeof args.reqHeader === 'string' ? parseHeaderFilter(args.reqHeader) : undefined;
            if (reqHeader !== undefined)
                options.reqHeader = reqHeader;
            const resHeader = typeof args.resHeader === 'string' ? parseHeaderFilter(args.resHeader) : undefined;
            if (resHeader !== undefined)
                options.resHeader = resHeader;
            if (typeof args.startId === 'string' && args.startId.trim() !== '')
                options.startId = args.startId.trim();
            if (typeof args.startTime === 'number' && Number.isFinite(args.startTime))
                options.startTime = args.startTime;
            try {
                return await client.call('list captured sessions', async (api) => {
                    const rows = await collectSessions(api, options, limit);
                    const lines = [];
                    const filters = Object.keys(options)
                        .filter((key) => key !== 'startId' && key !== 'startTime')
                        .map((key) => key + '=' + JSON.stringify(options[key]));
                    lines.push('whistle ' + (api.version ?? client.version) + '  ·  ' + rows.length + ' row(s)'
                        + (filters.length === 0 ? '' : '  ·  ' + filters.join(' ')));
                    if (rows.length === 0) {
                        lines.push('No matching records: check that the traffic really goes through Whistle (the capture UI shows it), '
                            + 'or loosen the filters.');
                        return lines.join('\n');
                    }
                    lines.push(sessionTableHeader());
                    for (const row of rows)
                        lines.push(sessionLine(api, row));
                    if (rows.length >= limit) {
                        lines.push('');
                        lines.push('Possibly more: pass the last row id as startId to continue, or narrow the window with startTime.');
                    }
                    return lines.join('\n');
                }, { signal: exec.signal });
            }
            catch (cause) {
                throw asToolFailure(cause);
            }
        },
    });
}
