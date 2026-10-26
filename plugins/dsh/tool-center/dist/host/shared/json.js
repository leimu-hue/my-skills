/**
 * 一个「普通对象」判断：非 null、非数组。
 *
 * 技能状态、提示词索引、场景文档、HTTP 请求体、回收站索引、场景白名单……原先各自手写
 * 同一串 `value !== null && typeof value === 'object' && !Array.isArray(value)`。
 * 收在这里，语义只解释一次。
 */
export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
