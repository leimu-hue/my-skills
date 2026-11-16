/**
 * 失败身份与时间预算。
 *
 * 这里的错误都要穿过两层边界（whistle 的 CommonJS api -> 本插件的 Host ->
 * 模型的工具结果），所以每条失败都自带「原因 + 怎么办」：模型看到的文本就是
 * 用户能照着做的那句话，不必再去猜 ECONNREFUSED 意味着什么。
 */
/** 一次 whistle 调用失败的身份；`code` 供测试与日志区分，`hint` 给模型照着做。 */
export class WhistleError extends Error {
    code;
    hint;
    constructor(code, message, hint = '') {
        super(message);
        this.name = 'WhistleError';
        this.code = code;
        this.hint = hint;
    }
    /** 工具结果里要给出的完整文本：失败原因换行接一句可执行的建议。 */
    get text() {
        return this.hint === '' ? this.message : this.message + '\n' + this.hint;
    }
}
/** 工具失败一律变成普通 `Error`：DSH 会把它渲染成 isError 的工具结果。 */
export function asToolFailure(cause) {
    return new Error(textOf(cause));
}
/** 任意抛出物到一行文本。 */
export function textOf(cause) {
    if (cause instanceof WhistleError)
        return cause.text;
    if (cause instanceof Error)
        return cause.message;
    return String(cause);
}
const CONNECTION_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'EPIPE',
    'ECONNABORTED',
]);
const CONNECTION_HINT = 'The Whistle service is not running, or its port changed. Run `w2 start`, then retry; if the '
    + 'port really changed, check `w2 status` — this plugin re-reads the config on the next call.';
/**
 * 把底层异常归一到 `WhistleError`。
 *
 * `context` 是失败发生在做什么（例如「读取抓包列表」），会拼在原因前面，
 * 这样模型不必从堆栈里推断是哪一步断了。
 */
export function describeFailure(cause, context) {
    if (cause instanceof WhistleError)
        return cause;
    const failure = cause;
    const code = typeof failure?.code === 'string' ? failure.code : '';
    const detail = textOf(cause);
    if (CONNECTION_CODES.has(code) || /ECONNREFUSED|socket hang up|connect ECONN/i.test(detail)) {
        return new WhistleError('connection', context + ' failed: cannot reach the Whistle proxy (' + (code || 'connection') + ').', CONNECTION_HINT);
    }
    if (code === 'ENOENT' || /not recognized|command not found|is not recognized/i.test(detail)) {
        return new WhistleError('missing', context + ' failed: the Whistle CLI (w2) was not found.', 'Install it first: npm install -g whistle, then `w2 start`.');
    }
    return new WhistleError(code === '' ? 'failed' : code, context + ' failed: ' + detail);
}
/**
 * 给 whistle 的请求套上超时与取消。
 *
 * 底层是 http 请求，没法真正中断，所以这里是「不再等它」而不是「杀掉它」：
 * promise 之后的 settle 会被忽略，模型这一轮不会被一个挂死的代理拖住。
 * 必须同时消费原 promise 的 rejection，否则会冒出 unhandled rejection。
 */
export function raceWithBudget(work, budget) {
    const { label, timeoutMs, signal } = budget;
    if (timeoutMs <= 0 && signal === undefined)
        return work;
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const stop = () => {
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            if (signal !== undefined)
                signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
            if (settled)
                return;
            stop();
            reject(new WhistleError('aborted', label + ' was cancelled'));
        };
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                if (settled)
                    return;
                stop();
                reject(new WhistleError('timeout', label + ' timed out (no response in ' + timeoutMs + ' ms)', 'Whistle may be stuck or its port taken; check `w2 status`, and run `w2 restart` if needed.'));
            }, timeoutMs);
        }
        if (signal !== undefined) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
        work.then((value) => {
            if (settled)
                return;
            stop();
            resolve(value);
        }, (cause) => {
            if (settled)
                return;
            stop();
            reject(cause);
        });
    });
}
export async function attempt(work) {
    try {
        return { ok: true, value: await work() };
    }
    catch (cause) {
        return { ok: false, reason: textOf(cause) };
    }
}
