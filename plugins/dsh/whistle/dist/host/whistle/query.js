/** whistle 单次返回上限，也是判断「还有下一页」的依据。 */
export const PAGE_SIZE = 120;
/** 单次工具调用最多问这么多页；再多就该让模型自己带游标。 */
const MAX_PAGES = 5;
export async function collectSessions(api, options, limit) {
    const collected = [];
    let cursor = options;
    for (let page = 0; page < MAX_PAGES && collected.length < limit; page += 1) {
        const rows = await api.network.getSessions(cursor);
        if (!Array.isArray(rows) || rows.length === 0)
            break;
        collected.push(...rows);
        /* 不足一页就是到头了：再问也是空。`latest` 只请求一次。 */
        if (rows.length < PAGE_SIZE || cursor.latest === true)
            break;
        const last = rows[rows.length - 1];
        if (last === undefined || typeof last.id !== 'string' || last.id === '')
            break;
        cursor = { ...cursor, startId: last.id, startTime: undefined };
    }
    return collected.slice(0, limit);
}
/**
 * 按 id 取一条记录。
 *
 * 没有 `getSession(id)` 这种 API，但 id 的前缀就是 `startTime`（`<ms>-<序号>`），
 * 所以先开一个 1ms 的窗口，抓不到再退回最新一页。旧记录被挤出 120 条窗口时确实
 * 取不到——那时错误信息会建议先用 `whistle_sessions` 拿 id。
 */
export async function findSession(api, id) {
    const marker = Number.parseInt(id, 10);
    const probes = [];
    if (Number.isFinite(marker) && marker > 0)
        probes.push({ startTime: marker - 1 });
    probes.push({ latest: true });
    for (const probe of probes) {
        const rows = await api.network.getSessions(probe);
        if (!Array.isArray(rows))
            continue;
        const hit = rows.find((row) => row.id === id);
        if (hit !== undefined)
            return hit;
    }
    return null;
}
export async function collectFrames(api, options, limit) {
    const collected = [];
    let cursor = options;
    for (let page = 0; page < MAX_PAGES && collected.length < limit; page += 1) {
        const rows = await api.network.getFrames(cursor);
        if (!Array.isArray(rows) || rows.length === 0)
            break;
        collected.push(...rows);
        if (rows.length < PAGE_SIZE || cursor.latest === true)
            break;
        const last = rows[rows.length - 1];
        if (last === undefined || typeof last.frameId !== 'string' || last.frameId === '')
            break;
        cursor = { ...cursor, startId: last.frameId, startTime: undefined };
    }
    return collected.slice(0, limit);
}
/**
 * 请求头过滤：`"x-token"` 只要求存在，`"x-token=abc"` 还要求值包含 `abc`。
 * 头名称里不含 `=`，所以按第一个 `=` 切分是安全的。
 */
export function parseHeaderFilter(value) {
    const trimmed = value.trim();
    if (trimmed === '')
        return undefined;
    const at = trimmed.indexOf('=');
    if (at <= 0)
        return { name: trimmed };
    const name = trimmed.slice(0, at).trim();
    const subValue = trimmed.slice(at + 1).trim();
    if (name === '')
        return undefined;
    return subValue === '' ? { name } : { name, subValue };
}
/** 工具入参的条数上限，防止模型一次要走整个缓冲。 */
export function clampCount(value, fallback, max) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.min(Math.max(Math.floor(value), 1), max);
}
