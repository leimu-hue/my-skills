export const PLUGIN_ID = 'tool-center';
export const GATE_HEADER = 'x-dsh-plugin';
/** 请求体上限：ZIP 导入走 base64，所以比普通 JSON 宽得多。 */
const MAX_BODY_BYTES = 48 * 1024 * 1024;
export function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}
/** 读取并解析 JSON 请求体，带硬性大小上限。 */
export async function readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_BODY_BYTES)
            throw new Error('body too large');
        chunks.push(buffer);
    }
    if (total === 0)
        return {};
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text === '')
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('body is not valid JSON');
    }
}
/** 宿主没有 `connection` 服务时的兜底：只认回环地址。 */
export function isTrusted(req) {
    const address = req.socket?.remoteAddress ?? '';
    const loopback = address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
    if (!loopback)
        return false;
    const host = String(req.headers.host ?? '');
    if (host !== '') {
        const hostname = host.replace(/:\d+$/, '').toLowerCase();
        if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]')
            return false;
    }
    return true;
}
/** content-type 可以不传；传了就必须是 JSON。 */
export function wantsJson(req) {
    const type = String(req.headers['content-type'] ?? '').toLowerCase();
    return type === '' || type.includes('application/json');
}
