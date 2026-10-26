import { describe } from '../shared/result.js';
import { GATE_HEADER, PLUGIN_ID, isTrusted, readJsonBody, sendJson, wantsJson } from '../shared/http.js';
import { READ_OPS } from './routes.js';
export const ROUTE_PATH = '/tool-center/api';
function rejectionOf(connection, req) {
    const service = connection();
    if (service !== undefined && typeof service.requestRejection === 'function') {
        try {
            const status = service.requestRejection(req);
            if (status === undefined || status === null)
                return undefined;
            return typeof status === 'number' ? status : 403;
        }
        catch {
            return 403;
        }
    }
    return isTrusted(req) ? undefined : 403;
}
/** op 的错误码 → HTTP 状态码（其余按 200 回，让面板统一念 `code`）。 */
function statusOf(code) {
    if (code === undefined)
        return 200;
    if (code.startsWith('error.args') || code.startsWith('error.name') || code.startsWith('error.description') || code.startsWith('error.root.'))
        return 400;
    if (code === 'error.skill.notFound' || code === 'error.trash.notFound')
        return 404;
    if (code === 'error.scope.reserved')
        return 501;
    return 200;
}
export function createRequestHandler(deps) {
    const { handlers, logger } = deps;
    return async (req, res) => {
        try {
            if (String(req.method ?? '').toUpperCase() !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'method not allowed', code: 'error.http.method' });
                return;
            }
            if (String(req.headers[GATE_HEADER] ?? '') !== PLUGIN_ID) {
                sendJson(res, 403, { ok: false, error: 'missing plugin gate header', code: 'error.http.gate' });
                return;
            }
            if (!wantsJson(req)) {
                sendJson(res, 415, { ok: false, error: 'content-type must be application/json', code: 'error.http.contentType' });
                return;
            }
            if (rejectionOf(deps.connection, req) !== undefined) {
                sendJson(res, 403, { ok: false, error: 'forbidden', code: 'error.http.forbidden' });
                return;
            }
            let payload;
            try {
                const parsed = await readJsonBody(req);
                payload = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : {};
            }
            catch (error) {
                if (describe(error).includes('body too large')) {
                    sendJson(res, 413, { ok: false, error: '请求体过大（上限 48 MiB）', code: 'error.http.tooLarge' });
                    return;
                }
                sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON', code: 'error.http.body' });
                return;
            }
            const op = typeof payload.op === 'string' ? payload.op : '';
            const args = payload.args !== null && typeof payload.args === 'object' && !Array.isArray(payload.args)
                ? payload.args
                : {};
            const handler = Object.prototype.hasOwnProperty.call(handlers, op) ? handlers[op] : undefined;
            if (handler === undefined) {
                sendJson(res, 404, { ok: false, error: `op 不存在：${op || '(空)'}`, code: 'error.op.unknown' });
                return;
            }
            const result = await handler(args);
            sendJson(res, result.ok ? 200 : statusOf(result.code), result);
            if (!READ_OPS.has(op))
                logger.write('op', `${op}${result.ok ? '' : ' 失败：' + String(result.error ?? '')}`);
        }
        catch (error) {
            logger.system(`op 抛出未捕获异常：${describe(error)}`);
            sendJson(res, 500, { ok: false, error: describe(error), code: 'error.internal' });
        }
    };
}
