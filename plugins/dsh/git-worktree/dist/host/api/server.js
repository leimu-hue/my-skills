import { DomainError, describe } from "../shared/errors.js";
import { isTrusted, readJsonBody, sendError, sendJson } from "../shared/http.js";
const ROUTE_BASE = '/git-worktree';
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
        if (connection === undefined) {
            const candidate = ctx.get('connection');
            connection = candidate !== undefined && typeof candidate.requestRejection === 'function' ? candidate : undefined;
        }
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
            sendError(res, 405, 'bad-request', 'POST required');
            return;
        }
        /* 响应在写完之前就 close，说明是请求方走了。中止信号交给处理器。 */
        const controller = new AbortController();
        res.on('close', () => {
            if (res.writableEnded !== true)
                controller.abort(new Error('request closed'));
        });
        try {
            const payload = await readJsonBody(req);
            const data = await deps.handler(payload, controller.signal);
            if (controller.signal.aborted)
                return;
            sendJson(res, 200, { ok: true, data });
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            if (error instanceof DomainError) {
                sendError(res, 400, error.code, error.message);
                return;
            }
            sendError(res, 500, 'internal', deps.method + ': ' + describe(error));
        }
    };
}
/** 一个方法一条 exact 路由；`register()` 不接管生命周期，必须由 `ctx.effect()` 回收。 */
export function installRoutes(ctx, handlers) {
    const webServer = ctx.webServer;
    for (const [method, handler] of Object.entries(handlers)) {
        const serve = createRouteHandler({ ctx, method, handler });
        ctx.effect(() => webServer.register({ kind: 'exact', path: routePath(method), handler: serve }), 'git-worktree: route ' + method);
    }
}
