/**
 * `whistle_frames`：一个 WebSocket / Socket 连接的帧。
 *
 * 帧和抓包记录是两张表，靠 `reqId`（也就是会话 id）关联。默认只给最新一页，
 * 每条一行、正文截断到 `bodyLimit` —— 长连接刷起来很快，一次灌太多没有意义。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { asToolFailure } from "../shared/errors.js";
import { clampCount, collectFrames } from "../whistle/query.js";
import { frameLine, frameTableHeader } from "../whistle/format.js";
export const FRAMES_TOOL = 'whistle_frames';
export function createFramesTool(client) {
    return defineTool({
        name: FRAMES_TOOL,
        description: 'List WebSocket/Socket frames of one captured connection. reqId is the session id from whistle_sessions '
            + '(a WS request). Each row shows frameId, direction (C>S client to server, S>C server to client), opcode, size and '
            + 'the decoded body. Use latest=true for the newest page; pass startId (a frameId) to page forward.',
        parameters: {
            reqId: { type: 'string', required: true, description: 'Session id the frames belong to (whistle_sessions id).' },
            from: {
                type: 'string',
                enum: ['all', 'client', 'server'],
                description: 'Only frames from this side (default all).',
            },
            latest: { type: 'boolean', description: 'Return the newest page only (default false).' },
            count: { type: 'number', description: 'How many frames to return, 1-200 (default 30).' },
            startId: { type: 'string', description: 'Cursor: only frames after this frameId.' },
            startTime: { type: 'number', description: 'Cursor: only frames after this epoch millisecond.' },
            bodyLimit: { type: 'number', description: 'Max characters of each frame body (default 240).' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const limit = clampCount(args.count, 30, 200);
            const bodyLimit = clampCount(args.bodyLimit, 240, 20000);
            const options = { reqId: args.reqId.trim() };
            if (args.from === 'client' || args.from === 'server')
                options.from = args.from;
            if (args.latest === true)
                options.latest = true;
            if (typeof args.startId === 'string' && args.startId.trim() !== '')
                options.startId = args.startId.trim();
            if (typeof args.startTime === 'number' && Number.isFinite(args.startTime))
                options.startTime = args.startTime;
            try {
                return await client.call('read frames of ' + options.reqId, async (api) => {
                    const rows = await collectFrames(api, options, limit);
                    const lines = ['reqId ' + String(options.reqId) + '  ·  ' + rows.length + ' frame(s)'
                            + (typeof options.from === 'string' ? '  ·  from=' + options.from : '')];
                    if (rows.length === 0) {
                        lines.push('No frames in this window: the connection may be idle, or the frames have already scrolled out.');
                        return lines.join('\n');
                    }
                    lines.push(frameTableHeader());
                    for (const row of rows)
                        lines.push(frameLine(api, row, bodyLimit));
                    if (rows.length >= limit) {
                        lines.push('');
                        lines.push('Possibly more: pass the last frameId as startId to page forward.');
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
