/**
 * op 回执与领域异常。
 *
 * 每个域（技能文件、提示词、MCP、场景）都用同一种「带 code 的异常 → `{ok:false}` 回执」
 * 形状，所以这里只留一份：`DomainError` 给业务层抛，`errorResult()` 给边界层翻译。
 * 早先每个域各写一个 `XxxError` 类、再加一份同样的 `catch` 翻译，四处逐字重复。
 */
/** 业务异常：`code` 是界面可翻译的错误码，`message` 是给人看的句子。 */
export class DomainError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** 把任何异常翻成 op 回执；非 `DomainError` 一律算内部错误。 */
export function errorResult(cause, code = 'error.internal') {
    if (cause instanceof DomainError)
        return { ok: false, error: cause.message, code: cause.code };
    return { ok: false, error: describe(cause), code };
}
/** 从任意值里取一句人话（日志与回执共用）。 */
export function describe(error) {
    return String(error?.message ?? error);
}
