export function summariseRules(status) {
    const list = Array.isArray(status?.list) ? status.list : [];
    const files = list.map((item) => ({ name: item?.name ?? '', selected: item?.selected === true }));
    return {
        disabled: status?.disabled === true,
        pluginsDisabled: status?.pluginsDisabled === true,
        multiSelect: status?.multiSelect === true,
        laterRulesFirst: status?.laterRulesFirst === true,
        selected: files.filter((item) => item.selected).map((item) => item.name),
        files,
        total: files.length,
    };
}
/** 比较规则文本时忽略换行风格与结尾空行：whistle 可能把 `\n` 规范化成 `\r\n`。 */
export function normaliseRuleText(value) {
    return value.replace(/\r\n/g, '\n').replace(/\s+$/, '');
}
export function sameRuleText(left, right) {
    return normaliseRuleText(left) === normaliseRuleText(right);
}
/** `rules.get()` 在不同版本上可能给字符串、`{ value }` 或空。 */
export function ruleValueOf(raw) {
    if (typeof raw === 'string')
        return raw;
    if (raw !== null && typeof raw === 'object') {
        const value = raw.value;
        if (typeof value === 'string')
            return value;
    }
    return '';
}
/**
 * 规则文件是否存在。
 *
 * 真实环境里 `rules/get` 对存在但为空的文件返回 `{ selected: true }`（没有
 * `value` 字段），只有真不存在时才返回空 —— 所以「不是空值」才算存在，
 * 不能用内容是否为空来判断。
 */
export function ruleExists(raw) {
    if (raw === null || raw === undefined)
        return false;
    if (typeof raw === 'string')
        return raw !== '';
    return true;
}
