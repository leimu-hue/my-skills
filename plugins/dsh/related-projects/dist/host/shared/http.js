import { RegistryError } from './errors.js';
export function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(text),
    });
    res.end(text);
}
/** Client 的 `call()` 唯一认得的失败信封。 */
export function sendError(res, status, code, message) {
    sendJson(res, status, { ok: false, error: { code, message } });
}
function header(req, name) {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
}
function isLoopbackHostname(hostname) {
    return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127\./.test(hostname);
}
function isSameAuthority(origin, host) {
    let originUrl;
    try {
        originUrl = new URL(origin);
    }
    catch {
        return false;
    }
    const scheme = originUrl.protocol === 'https:' ? 'https:' : (originUrl.protocol === 'http:' ? 'http:' : null);
    if (scheme === null)
        return false;
    try {
        /* 按 Origin 的协议比较，这样默认端口才能归一化。 */
        return originUrl.host === new URL(scheme + '//' + host).host;
    }
    catch {
        return false;
    }
}
/**
 * Host 没有 Connection 服务时的兜底信任栅栏。
 *
 * 载体对具名路由不施加任何认证或 Origin 策略（见 docs/subsystems/web-server.md），
 * 所以暴露写操作的路由必须自己加一道：跨站请求一律拒绝，带了 Origin 就必须精确指
 * 向本权威，没有浏览器 Origin 时只接受回环调用方。
 *
 * 内置的 Web 组合会挂载 `ctx.connection`，它的 `requestRejection()` 才是权威；
 * 这个函数只是兜底。
 */
export function isTrusted(req) {
    const host = header(req, 'host');
    if (host === undefined || host === '')
        return false;
    if (header(req, 'sec-fetch-site') === 'cross-site')
        return false;
    const origin = header(req, 'origin');
    if (origin !== undefined)
        return isSameAuthority(origin, host);
    const hostname = host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '');
    return isLoopbackHostname(hostname);
}
export function readJsonBody(req, limit = 1 << 20) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new RegistryError('too-large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (raw.trim() === '') {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                resolve(parsed !== null && typeof parsed === 'object' ? parsed : {});
            }
            catch {
                reject(new RegistryError('bad-json'));
            }
        });
        req.on('error', () => reject(new RegistryError('transport')));
    });
}
