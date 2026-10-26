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
import { boundaryText, changeNotice, listText, NOTICE_NAME, NOTICE_ORDER, SECTION_NAME, SECTION_ORDER, sectionText } from './text.js'
import { promptService } from '../shared/context.js'
import { sandboxModeOf, workspaceOfAgent } from '../workspace/service.js'
import { workspaceKey } from '../shared/paths.js'
import type { AgentLike, HostContext } from '../shared/context.js'
import type { Registry } from '../registry/service.js'

interface Entry {
  agent: AgentLike
  workspace: string
  key: string
  disposeSection?: () => void
  /** 唯一存活的那份变更快照的清理函数（若已追加过）。 */
  disposeNotice?: () => void
  /** 已追加的快照数量；仅用于诊断。 */
  noticeCount: number
  /** Agent 注册失败或从未发生；原因见 sectionError。 */
  sectionOn: 'agent' | 'none'
  sectionError?: string
}

export class SessionRegistry {
  private readonly ctx: HostContext
  private readonly registry: Registry
  private readonly entries = new Map<string, Entry>()
  /** 每条通知自增一次：让每个 provider 名称在进程内唯一。 */
  private generation = 0

  constructor(ctx: HostContext, registry: Registry) {
    this.ctx = ctx
    this.registry = registry
  }

  get size(): number {
    return this.entries.size
  }

  /** 供 `/prompt` 路由使用的诊断：这个会话到底接上了没有？ */
  describe(sessionId: string): { attached: boolean; section: string; notices: number } {
    const entry = this.entries.get(sessionId)
    if (entry === undefined) return { attached: false, section: 'no-session', notices: 0 }
    return {
      attached: true,
      section: entry.sectionError !== undefined ? 'failed: ' + entry.sectionError : entry.sectionOn,
      notices: entry.noticeCount,
    }
  }

  attach(agent: AgentLike | undefined): void {
    if (agent === undefined || agent === null) return
    const id = String(agent.id)
    if (this.entries.has(id)) return
    const workspace = workspaceOfAgent(this.ctx, agent)
    if (workspace === '') return
    const promptCtx = agent.ctx
    if (promptCtx === undefined) return

    const entry: Entry = {
      agent,
      workspace,
      key: workspaceKey(workspace),
      noticeCount: 0,
      sectionOn: 'none',
    }
    const service = promptService(promptCtx)
    if (service === undefined) {
      entry.sectionOn = 'none'
      entry.sectionError = 'systemPrompt unavailable'
      this.entries.set(id, entry)
      return
    }

    /* 首次渲染后冻结并复用：稳定的头部才能让 provider 的前缀缓存在整个会话期间有效。
       变更以追加式通知的形式发出，而不是重写这个节点。 */
    let rendered: string | null = null
    const text = (): string => {
      if (rendered === null) {
        rendered = sectionText(this.registry, workspace, boundaryText(sandboxModeOf(this.ctx, agent.session)))
      }
      return rendered
    }

    try {
      entry.disposeSection = promptCtx.effect(() => service.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text,
        interpolate: false,
      }), 'related-projects: session section')
      entry.sectionOn = 'agent'
    } catch (failure) {
      entry.sectionOn = 'none'
      entry.sectionError = failure instanceof Error ? failure.message : String(failure)
    }

    this.entries.set(id, entry)
  }

  detach(agent: AgentLike | undefined): void {
    if (agent === undefined || agent === null) return
    const id = String(agent.id)
    const entry = this.entries.get(id)
    if (entry === undefined) return
    this.entries.delete(id)
    this.release(entry)
  }

  /**
   * 把一份变更快照追加到该 workspace 的每个存活会话。
   *
   * 快照在全新的名称下携带静态文本，因此它作为尾节点进入历史一次：不重写头部，
   * 也不重复投递。没有存活的会话就无需处理——它下次启动时，小节会从注册表渲染。
   */
  notify(workspace: string, summary: string): { delivered: number } {
    const key = workspaceKey(workspace)
    let delivered = 0
    for (const entry of this.entries.values()) {
      if (entry.key !== key) continue
      const promptCtx = entry.agent.ctx
      if (promptCtx === undefined) continue
      const service = promptService(promptCtx)
      const addContext = service?.context
      if (service === undefined || typeof addContext !== 'function') continue
      /* 通知只带当前的行：冻结小节里已经有说明文字和写边界。 */
      const text = changeNotice(summary, listText(this.registry, entry.workspace))
      /* 每次变更用唯一名称，通知才会追加，而不是就地替换早先的快照
         （就地替换会让前缀从它原来的位置起失效）。 */
      this.generation += 1
      const name = NOTICE_NAME + '-' + String(Date.now()) + '-' + String(this.generation)
      try {
        const dispose = promptCtx.effect(() => addContext.call(service, {
          name,
          order: NOTICE_ORDER,
          text,
          interpolate: false,
        }) ?? (() => {}), 'related-projects: change notice')
        /* 先换上再弃用：新快照已给出完整的当前列表，较早的 provider 因此是冗余的——
           留着它会让之后每个快照都重复一遍它的文本。 */
        const previous = entry.disposeNotice
        entry.disposeNotice = dispose
        entry.noticeCount += 1
        try {
          previous?.()
        } catch {
          /* 已经不存在了 */
        }
        delivered += 1
      } catch {
        /* 重名（世代过期）不能让其他会话一起中止。 */
      }
    }
    return { delivered }
  }

  disposeAll(): void {
    for (const entry of this.entries.values()) this.release(entry)
    this.entries.clear()
  }

  private release(entry: Entry): void {
    try {
      entry.disposeSection?.()
    } catch {
      /* 已经不存在了 */
    }
    try {
      entry.disposeNotice?.()
    } catch {
      /* 已经不存在了 */
    }
  }
}
