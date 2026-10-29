import { isTrusted, readJsonBody, sendError, sendJson } from '../shared/http.js';
import { RegistryError } from '../shared/errors.js';
import { connectionOf } from '../shared/context.js';
const ROUTE_BASE = '/related-projects';
/** 一个方法的具名路由路径；注册与 Client 拼 URL 共用这一个函数。 */
export function routePath(method) {
    return ROUTE_BASE + '/' + method;
}
/**
 * 供挂载 `webServer` 却没有 `connection` 的 Host 使用的门禁。`connection`
 * 的查找会反复重试直到成功：组合可能在本插件生效之后才提供该服务。
 */
function trustFence(ctx) {
    let connection;
    return (req) => {
        if (connection === undefined)
            connection = connectionOf(ctx);
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
export function createRouteHandler(deps) {
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
        /* 响应在写完之前就 close，说明是请求方走了（客户端换了两次按键就会这样）。
           中止信号交给处理器，让它们把没人在等的遍历停下来。 */
        const controller = new AbortController();
        res.on('close', () => {
            if (res.writableEnded !== true)
                controller.abort(new Error('request closed'));
        });
        try {
            const payload = await readJsonBody(req);
            const data = await deps.handler(payload, controller.signal);
            /* 已经中止：连接不在了，写回执没有意义，也不能把 abort 报成 500。 */
            if (controller.signal.aborted)
                return;
            sendJson(res, 200, { ok: true, data });
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            if (error instanceof RegistryError) {
                sendError(res, 400, error.code, error.code);
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            sendError(res, 500, 'internal', deps.method + ': ' + message);
        }
    };
}
