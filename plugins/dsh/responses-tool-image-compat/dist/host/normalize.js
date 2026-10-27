/**
 * Responses API 请求体规范化：把网关不接受的 `function_call_output.output` 数组形态
 * 改写为字符串形态。
 *
 * 背景：
 *   Responses 规范的适配器在工具结果里带图片时，会发出
 *
 *     { type: "function_call_output", call_id: "…",
 *       output: [{ type: "input_text", … }, { type: "input_image", … }] }
 *
 * 这是 OpenAI 官方 Responses 规范允许的形态，但部分 OpenAI 兼容网关的反序列化
 * 只接受 `output: string`，于是整个请求被拒：
 *
 *   400 invalid_request_error / json_parse_error
 *   "input: data did not match any variant of untagged enum ResponseInput"
 *
 * 因为该 item 已经写进会话历史，之后每一次请求都会重放它，会话从此永久失败——
 * 即"流程被暂停"。本模块只改写**出站请求体**，不动会话历史，因此对已经中毒的
 * 会话同样立即生效。
 */
/** 适配器可能发出的、output 允许是数组的 item 类型。 */
const OUTPUT_ARRAY_ITEM_TYPES = new Set(['function_call_output', 'custom_tool_call_output']);
/** 视为"文本"的输出分段类型。 */
const TEXT_PART_TYPES = new Set(['input_text', 'text', 'output_text', 'summary_text']);
/** 承载多模态内容的输出分段类型。 */
const NON_TEXT_PART_TYPES = new Set(['input_image', 'image', 'input_file', 'file']);
const DEFAULT_CAPTION = 'Tool result image (moved out of the tool output because this gateway rejects non-string tool outputs):';
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function textOf(part) {
    const type = typeof part.type === 'string' ? part.type : '';
    if (!TEXT_PART_TYPES.has(type))
        return undefined;
    return typeof part.text === 'string' ? part.text : undefined;
}
/**
 * 把一个 output 分段数组拆成「纯文本」与「需要 hoist 的分段」。
 * 无法识别的分段按文本降级，避免静默丢信息。
 */
function splitOutputParts(parts) {
    const texts = [];
    const hoisted = [];
    const degraded = [];
    for (const raw of parts) {
        if (typeof raw === 'string') {
            texts.push(raw);
            continue;
        }
        if (!isPlainObject(raw)) {
            degraded.push(String(raw));
            continue;
        }
        const text = textOf(raw);
        if (text !== undefined) {
            texts.push(text);
            continue;
        }
        const type = typeof raw.type === 'string' ? raw.type : '';
        if (NON_TEXT_PART_TYPES.has(type)) {
            hoisted.push(raw);
            continue;
        }
        // 未知类型：保留可 JSON 化的内容，绝不丢数据。
        degraded.push(JSON.stringify(raw));
    }
    return { text: texts.join('\n'), hoisted, degraded };
}
/**
 * 一个 output 分段数组 → { output: string, hoisted } 。
 *
 * 空数组按"无输出"处理：网关对空字符串也是接受的，但适配器侧的
 * "(no tool output)" 语义更有用。
 */
function flattenOutput(parts, strategy) {
    const { text, hoisted, degraded } = splitOutputParts(parts);
    if (strategy === 'flatten') {
        const notes = hoisted.map((part) => {
            const type = typeof part.type === 'string' ? part.type : 'attachment';
            return `[${type} omitted: this gateway only accepts string tool outputs]`;
        });
        const merged = [text, ...degraded, ...notes].filter((chunk) => chunk.length > 0).join('\n');
        return { output: merged.length > 0 ? merged : '(no tool output)', hoisted: [] };
    }
    const merged = [text, ...degraded].filter((chunk) => chunk.length > 0).join('\n');
    const output = merged.length > 0
        ? merged
        : hoisted.length > 0
            ? '(see the image attached in the next message)'
            : '(no tool output)';
    return { output, hoisted };
}
/** hoist 出来的图片挂成的 user 消息。 */
function hoistedMessage(callId, toolName, parts, caption) {
    const label = toolName.length > 0 ? `${toolName} (${callId})` : callId;
    return {
        type: 'message',
        role: 'user',
        content: [
            { type: 'input_text', text: `${caption} ${label}` },
            ...parts.map((part) => ({ ...part })),
        ],
    };
}
/**
 * 规范化一个 Responses 请求体的 `input` 数组。
 *
 * 只处理 output 为数组的 tool 输出条目，其余条目原样（包括引用同一对象）保留。
 * 返回值是纯函数结果，不修改入参。
 */
export function normalizeResponsesBody(body, options = {}) {
    const strategy = options.strategy ?? 'hoist';
    const caption = options.caption ?? DEFAULT_CAPTION;
    const unchanged = { changed: false, rewrittenItems: 0, hoistedParts: 0, body };
    if (!isPlainObject(body))
        return unchanged;
    const input = body.input;
    if (!Array.isArray(input))
        return unchanged;
    let rewrittenItems = 0;
    let hoistedParts = 0;
    const nextInput = [];
    for (const item of input) {
        if (!isPlainObject(item) || typeof item.type !== 'string' || !OUTPUT_ARRAY_ITEM_TYPES.has(item.type)) {
            nextInput.push(item);
            continue;
        }
        const output = item.output;
        if (!Array.isArray(output)) {
            nextInput.push(item);
            continue;
        }
        const callId = typeof item.call_id === 'string' ? item.call_id : '';
        const toolName = typeof item.name === 'string' ? item.name : '';
        const { output: flat, hoisted } = flattenOutput(output, strategy);
        nextInput.push({ ...item, output: flat });
        rewrittenItems += 1;
        if (hoisted.length > 0) {
            hoistedParts += hoisted.length;
            nextInput.push(hoistedMessage(callId, toolName, hoisted, caption));
        }
    }
    if (rewrittenItems === 0)
        return unchanged;
    return {
        changed: true,
        rewrittenItems,
        hoistedParts,
        body: { ...body, input: nextInput },
    };
}
/**
 * 判断一个 URL 是否值得规范化：Responses 端点（路径以 /responses 结尾）。
 * chat/completions 的 `tool` 消息形态完全不同，不在这里处理。
 */
export function isResponsesEndpoint(url) {
    const path = url.split('?')[0].replace(/\/+$/, '');
    return /\/responses$/.test(path);
}
/**
 * 按 endpoints 配置匹配 URL。
 * `['*']` 表示所有 Responses 端点；其余条目按「主机名 / 主机名+路径前缀」子串匹配。
 */
export function endpointMatches(url, patterns) {
    if (patterns.length === 0)
        return true;
    if (patterns.includes('*'))
        return true;
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return false;
    }
    const haystack = `${parsed.host}${parsed.pathname}`;
    return patterns.some((pattern) => {
        const needle = pattern.trim();
        if (needle.length === 0)
            return false;
        return haystack.includes(needle.replace(/^https?:\/\//, '').replace(/\/+$/, ''));
    });
}
