import { RegistryError } from './store.js';
export function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(text),
    });
    res.end(text);
}
function header(req, name) {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
}
function isLoopbackHostname(hostname) {
    return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127\./.test(hostname);
}
function authorityOf(host, scheme) {
    try {
        return new URL(scheme + '//' + host);
    }
    catch {
        return undefined;
    }
}
/** Compare Host under the Origin's scheme, so default ports normalize. */
function isSameAuthority(origin, host) {
    let originUrl;
    try {
        originUrl = new URL(origin);
    }
    catch {
        return false;
    }
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:')
        return false;
    const hostUrl = authorityOf(host, originUrl.protocol === 'https:' ? 'https:' : 'http:');
    return hostUrl !== undefined && originUrl.host === hostUrl.host;
}
/**
 * Fallback trust fence for a Host without the Connection service. The carrier
 * applies no authentication or Origin policy to named routes (see
 * docs/subsystems/web-server.md), so a route that exposes mutations has to
 * apply one. This mirrors the documented browser fence: a cross-site request is
 * refused, an attached Origin must name this exact authority, and without a
 * browser Origin only loopback callers are accepted.
 *
 * The shipped Web composition mounts `ctx.connection`, whose
 * `requestRejection()` is authoritative (Host/Origin plus browser
 * authentication); this function is only the fallback.
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
