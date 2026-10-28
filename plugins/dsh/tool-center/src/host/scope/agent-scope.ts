/**
 * 会话身份 → 工作区：场景、工具闸门、`/scene` 共用的唯一口径。
 *
 * 为什么要单独一个文件：这三处都要回答「这个 agent 属于哪个工作区」，取法一旦抄成两份就会
 * 分叉，症状是「技能按 A 项目隔离生效、MCP 工具却没隔离」。
 *
 * 两条从参考实现（dsh-plugin-tool-management）学来的硬约束：
 *
 *   * **子会话要向上找到根会话。** 子代理 / 侧聊有**自己的** session id，但作用域属于它
 *     所属的那次对话：不往上找，父会话里藏起来的服务器与技能，派一个子代理就能重新看见。
 *     链路是宿主写在会话头里的 `header.parentSession`。
 *   * **拿不到身份时按「没有隔离」处理，绝不猜。** 猜错的代价是「A 的设置漏进 B」；而按
 *     全局最多是「这一处没隔离」，用户看得见、也不串内容。
 *
 * 会话头里没有 workspaceId，所以工作区一律以 cwd 为准（与工作区分组、项目来源同一口径）。
 * 父会话的 cwd 手里不一定有（`parentSession` 只给 id），所以见过就记一份，记不到就退回
 * 子会话自己的 cwd —— 仍然是「宁可少共享一层，不串到别的工作区」。
 */
import { normaliseWorkspace } from '../scenes/service.js'

/** 会话 id → 见过的 cwd（只记内存；上限到了丢最早的）。 */
const SESSION_CWDS = new Map<string, string>()
const SESSION_CWDS_MAX = 4096

/** 会话 id → 父会话 id（同样只记内存）。 */
const SESSION_PARENTS = new Map<string, string>()
const SESSION_PARENTS_MAX = 4096

function remember(map: Map<string, string>, key: string, value: string, max: number): void {
  map.set(key, value)
  if (map.size <= max) return
  const oldest = map.keys().next()
  if (!oldest.done) map.delete(oldest.value)
}

interface AgentLike {
  session?: {
    id?: unknown
    header?: { id?: unknown; cwd?: unknown; parentSession?: unknown }
    meta?: { cwd?: unknown }
  }
}

/** 会话 id：活会话对象上的 `session.id`，或持久化头里的 `session.header.id`（两条路径各给一个）。 */
export function sessionIdOf(agent: unknown): string | null {
  const session = (agent as AgentLike | null | undefined)?.session
  const id = typeof session?.id === 'string' && session.id !== ''
    ? session.id
    : (typeof session?.header?.id === 'string' && session.header.id !== '' ? session.header.id : null)
  return id
}

/** 这个 agent 自己的 cwd（`header.cwd`，旧形状回退 `meta.cwd`）。 */
function ownCwdOf(agent: unknown): string {
  const session = (agent as AgentLike | null | undefined)?.session
  for (const candidate of [session?.header?.cwd, session?.meta?.cwd]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return normaliseWorkspace(candidate)
  }
  return ''
}

/** 会话头里的父会话（子代理 / 侧聊派生时存在）。 */
function parentSessionOf(agent: unknown): string | null {
  const parent = (agent as AgentLike | null | undefined)?.session?.header?.parentSession
  if (typeof parent !== 'string' || parent === '' || parent === '__proto__') return null
  return parent
}

/**
 * 这个 agent 所属的**根会话** id。
 *
 * 沿 `parentSession` 逐层上溯并登记链路；遇到环、断链、自己指自己就停在当时那一层。
 * 取不到会话 id 时返回 null（调用方按「没有隔离」处理）。
 */
export function rootSessionIdOf(agent: unknown): string | null {
  const id = sessionIdOf(agent)
  if (id === null) return null
  const parent = parentSessionOf(agent)
  if (parent !== null && parent !== id) remember(SESSION_PARENTS, id, parent, SESSION_PARENTS_MAX)

  let current = id
  const seen = new Set<string>()
  for (;;) {
    const up = SESSION_PARENTS.get(current)
    if (up === undefined || up === current || seen.has(up)) return current
    seen.add(current)
    current = up
  }
}

/**
 * 这个 agent 该用哪个工作区（'' = 没有，场景与工具闸门都不生效）。
 *
 * 顺序：根会话见过的 cwd → 它自己的 cwd → ''。顺便把见到的 cwd 记下来，
 * 这样同一轮里后装上的子会话能拿到父会话的工作区。
 */
export function workspaceOfAgent(agent: unknown): string {
  const own = ownCwdOf(agent)
  const id = sessionIdOf(agent)
  if (id !== null && own !== '') remember(SESSION_CWDS, id, own, SESSION_CWDS_MAX)

  const root = rootSessionIdOf(agent)
  const rootCwd = root === null ? undefined : SESSION_CWDS.get(root)
  if (rootCwd !== undefined && rootCwd !== '') return normaliseWorkspace(rootCwd)
  return own
}
