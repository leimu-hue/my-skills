import { isTrusted, readJsonBody, sendError, sendJson } from '../shared/http.js';
import { RegistryError } from '../shared/errors.js';
import { connectionService } from '../shared/context.js';
export const ROUTE_PATH = '/related-projects/api';
/**
 * 供挂载 `webServer` 却没有 `connection` 的 Host 使用的门禁。`connection`
 * 的查找会反复重试直到成功：组合可能在本插件生效之后才提供该服务。
 */
function trustFence(ctx) {
    let connection;
    return (req) => {
        if (connection === undefined)
            connection = connectionService(ctx);
        const rejection = connection?.requestRejection;
        if (typeof rejection === 'function') {
            try {
                const status = rejection.call(connection, req);
                if (status === undefined || status === null)
                    return undefined;
                return typeof status === 'number' ? status : 403;
            }
            catch {
                return 403;
            }
        }
        return isTrusted(req) ? undefined : 403;
    };
}
function methodOf(url) {
    const pathname = new URL(url === undefined || url === '' ? '/' : url, 'http://dsh.internal').pathname;
    if (!pathname.startsWith(ROUTE_PATH + '/'))
        return '';
    const method = pathname.slice(ROUTE_PATH.length + 1);
    return method.includes('/') ? '' : method;
}
export function createRequestHandler(deps) {
    const { handlers } = deps;
    const fence = trustFence(deps.ctx);
    return async (req, res) => {
        const rejection = fence(req);
        if (rejection !== undefined) {
            const unauthorized = rejection === 401;
            sendError(res, rejection, unauthorized ? 'unauthorized' : 'forbidden', unauthorized ? 'browser session required' : 'forbidden');
            return;
        }
        if (req.method !== 'POST') {
            sendError(res, 405, 'method', 'POST required');
            return;
        }
        const method = methodOf(req.url);
        const handler = method !== '' && Object.prototype.hasOwnProperty.call(handlers, method) ? handlers[method] : undefined;
        if (handler === undefined) {
            sendError(res, 404, 'not-found', 'unknown method ' + method);
            return;
        }
        try {
            const payload = await readJsonBody(req);
            sendJson(res, 200, { ok: true, data: await handler(payload) });
        }
        catch (error) {
            if (error instanceof RegistryError) {
                sendError(res, 400, error.code, error.code);
                return;
            }
            sendError(res, 500, 'internal', error instanceof Error ? error.message : String(error));
        }
    };
}
