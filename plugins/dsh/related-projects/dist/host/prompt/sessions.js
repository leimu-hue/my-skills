/**
 * 每个会话的提示词通道，两者都对缓存友好：
 *
 *  - `section`：冻结的项目列表，每个会话只渲染一次。稳定的头部才能让 provider 的
 *    前缀缓存持续有效，所以该小节绝不能在会话中途变化；变更改以通知的形式抵达。
 *  - `notice`：描述单次变更的追加式快照。每次变更都注册一个新的 context 名称并携带
 *    静态文本，因此 DSH 会把它追加到历史尾部一次，此后永不再重写。已缓存的前缀
 *    （system prompt + 通知之前的全部内容）仍可复用——这正是不要动那个小节的全部意义。
 *    新通知注册后旧通知即被弃用：快照本身已带着完整的当前列表，留着更早的 provider
 *    只会让它的文本在之后每个快照里重复一遍。
 *
 * 为什么通知不是一个一次性的 `text()` provider：一次模型步骤会读两次 context
 * provider——先 `assemble()`，再在 `agent/pre-step` 之后 `refreshContext()`。若某个
 * provider 在第一次读取时就标记自己已交付，第二次会返回 ''，通知便永远到不了请求
 * （曾用导出的会话验证：通知文本出现次数为零）。静态文本没有这种读取顺序风险。
 *
 * 每次变更的实际代价：通知自身的 token，追加一次。它之前的内容仍留在缓存里。
 */
import { boundaryText, changeNotice, listText, NOTICE_NAME, NOTICE_ORDER, SECTION_NAME, SECTION_ORDER, sectionText } from './text.js';
import { sandboxModeOf, workspaceOfAgent } from '../workspace/service.js';
import { workspaceKey } from '../shared/paths.js';
/** 清理函数可能已被上下文提前回收：重复调用不能把其他会话一起中断。 */
function disposeQuietly(dispose) {
    try {
        dispose?.();
    }
    catch {
        /* 已经不存在了 */
    }
}
export class SessionRegistry {
    ctx;
    registry;
    entries = new Map();
    /** 每条通知自增一次：让每个 provider 名称在进程内唯一。 */
    generation = 0;
    constructor(ctx, registry) {
        this.ctx = ctx;
        this.registry = registry;
    }
    get size() {
        return this.entries.size;
    }
    /** 供 `/prompt` 路由使用的诊断：这个会话到底接上了没有？ */
    describe(sessionId) {
        const entry = this.entries.get(sessionId);
        if (entry === undefined)
            return { attached: false, section: 'no-session', notices: 0 };
        return {
            attached: true,
            section: entry.sectionError !== undefined ? 'failed: ' + entry.sectionError : entry.sectionOn,
            notices: entry.noticeCount,
        };
    }
    attach(agent) {
        if (agent === undefined)
            return;
        const id = String(agent.id);
        if (this.entries.has(id))
            return;
        const workspace = workspaceOfAgent(this.ctx, agent);
        if (workspace === '')
            return;
        /* agent 自己的作用域：systemPrompt 注册在这里才只影响这一个会话。 */
        const promptCtx = agent.ctx;
        const entry = {
            agent,
            workspace,
            key: workspaceKey(workspace),
            noticeCount: 0,
            sectionOn: 'none',
        };
        const service = promptCtx.get('systemPrompt');
        if (service === undefined) {
            entry.sectionOn = 'none';
            entry.sectionError = 'systemPrompt unavailable';
            this.entries.set(id, entry);
            return;
        }
        /* 首次渲染后冻结并复用：稳定的头部才能让 provider 的前缀缓存在整个会话期间有效。
           变更以追加式通知的形式发出，而不是重写这个节点。 */
        let rendered = null;
        const text = () => {
            if (rendered === null) {
                rendered = sectionText(this.registry, workspace, boundaryText(sandboxModeOf(this.ctx, agent.session)));
            }
            return rendered;
        };
        try {
            /* `section()` 自己把 disposer 挂到调用它的那个上下文上，不需要再包 effect。 */
            entry.disposeSection = service.section({
                name: SECTION_NAME,
                order: SECTION_ORDER,
                text,
                interpolate: false,
            });
            entry.sectionOn = 'agent';
        }
        catch (failure) {
            entry.sectionOn = 'none';
            entry.sectionError = failure instanceof Error ? failure.message : String(failure);
        }
        this.entries.set(id, entry);
    }
    detach(agent) {
        if (agent === undefined)
            return;
        const id = String(agent.id);
        const entry = this.entries.get(id);
        if (entry === undefined)
            return;
        this.entries.delete(id);
        this.release(entry);
    }
    /**
     * 把一份变更快照追加到该 workspace 的每个存活会话。
     *
     * 快照在全新的名称下携带静态文本，因此它作为尾节点进入历史一次：不重写头部，
     * 也不重复投递。没有存活的会话就无需处理——它下次启动时，小节会从注册表渲染。
     */
    notify(workspace, summary) {
        const key = workspaceKey(workspace);
        for (const entry of this.entries.values()) {
            if (entry.key !== key)
                continue;
            /* 每个会话自己的 systemPrompt：注册进 agent 作用域，才不会泄漏到别的会话。 */
            const prompt = entry.agent.ctx.get('systemPrompt');
            if (prompt === undefined)
                continue;
            /* 通知只带当前的行：冻结小节里已经有说明文字和写边界。 */
            const text = changeNotice(summary, listText(this.registry, entry.workspace));
            /* 每次变更用唯一名称，通知才会追加，而不是就地替换早先的快照
               （就地替换会让前缀从它原来的位置起失效）。 */
            this.generation += 1;
            const name = NOTICE_NAME + '-' + String(Date.now()) + '-' + String(this.generation);
            try {
                const dispose = prompt.context({
                    name,
                    order: NOTICE_ORDER,
                    text,
                    interpolate: false,
                });
                /* 先换上再弃用：新快照已给出完整的当前列表，较早的 provider 因此是冗余的——
                   留着它会让之后每个快照都重复一遍它的文本。 */
                const previous = entry.disposeNotice;
                entry.disposeNotice = dispose;
                entry.noticeCount += 1;
                disposeQuietly(previous);
            }
            catch {
                /* 重名（世代过期）不能让其他会话一起中止。 */
            }
        }
    }
    disposeAll() {
        for (const entry of this.entries.values())
            this.release(entry);
        this.entries.clear();
    }
    release(entry) {
        disposeQuietly(entry.disposeSection);
        disposeQuietly(entry.disposeNotice);
    }
}
