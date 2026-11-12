/**
 * 给某个 agent 塞一条用户消息所需的形状。
 *
 * 复刻 `@deepseek-ai/dsh-llm` 的 `createUserMessage`：它只做
 * `deepFreeze({ ...input, id: brandString(randomUUID()), role: 'user' })`。
 * 这里不静态 import 那个包，是因为本插件对 `@deepseek-ai/*` 只有类型依赖
 * （运行期依赖只有 dsh-tools 与 schemastery）；为发一条任务多一条硬依赖不合算。
 *
 * 代价：形状若变了，会话日志会在 append 时拒收。那时创建仍然成功，只在回执里
 * 报告「任务没发出去」——见 `service.startSession` 与 `CreateResult.taskError`。
 */
import { randomUUID } from 'node:crypto';
export function userTextMessage(text) {
    const message = {
        role: 'user',
        id: randomUUID(),
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
    };
    return deepFreeze(message);
}
/** 会话日志按值抓取消息，冻结是那条契约的一部分。 */
function deepFreeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const inner of Object.values(value))
            deepFreeze(inner);
        Object.freeze(value);
    }
    return value;
}
