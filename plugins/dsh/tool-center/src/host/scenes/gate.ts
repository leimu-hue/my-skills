/**
 * 场景的工具闸门：让「进入场景」在**工作区**里真正决定模型能看见哪些 MCP 工具。
 *
 * 为什么这样做得通：MCP 服务器对模型的作用就是「把一批工具注入工具目录」。DSH 的
 * `ctx.tools.restrict({ deny })` 允许在 **agent 作用域**里把继承来的全局工具遮掉
 * （掩码取交集、只影响这个 agent、dispose 即解除）。于是不必动宿主的
 * `cordis.patch.yml`：服务器照旧全局装载，只是「没进入场景的工作区里」这些工具不再出现在
 * 该会话的工具目录中。
 *
 * 三条边界，都与实现方式直接相关：
 *   * `restrict()` 只认**当前已注册**的工具名，未知名字直接抛错 —— 所以 deny 名单必须
 *     从真实注册表（`ctx.tools.schemas()`）算出来，工具集合变化时重算（`tools/change`）；
 *   * 它只能**收窄**。场景勾了一台宿主里没启用的服务器，工具根本不存在，这里无法凭空
 *     造出来 —— 那是「把 mcp-client 挂进 agent 作用域」另一件事，所以只告警；
 *   * 它不改变 scoped 注册（agent 自己那层），这是宿主刻意保留的豁免，我们不碰。
 */
import { loadMcp } from '../mcp/service.js'
import { effectiveSceneOf, loadScenes, normaliseWorkspace, serverMatches } from './service.js'
import { describe } from '../shared/result.js'

/** 只取这个模块用得到的那一个方法，其余形状不关心。 */
export interface ToolScope {
  restrict(filter: { allow?: string[]; deny?: string[] }): () => void
}

export interface SceneGateOptions {
  dshHome: string
  /** 全局工具名（`ctx.tools.schemas()` 不带 scope）；拿不到就返回空数组。 */
  globalToolNames(): string[]
  /** 某个 agent 作用域里的 tools 服务（`agent.ctx.get('tools')`）。 */
  toolsScopeOf(agent: unknown): ToolScope | undefined
  /** agent 所在工作区（`session.header.cwd`，旧形状回退 `session.meta.cwd`）。 */
  cwdOf(agent: unknown): string
  /** 当前活着的 agent（重挂限制时用）。 */
  liveAgents(): Iterable<unknown>
  /** 这个 agent 的根会话 id（子代理要用父会话的选择；取不到返回 null）。 */
  sessionIdOf?(agent: unknown): string | null
  log?(event: string, detail: string): void
}

export interface SceneGate {
  install(agent: unknown): Promise<void>
  uninstall(agent: unknown): void
  /** 场景或工具集合变了：按当前状态重算每个活 agent 的限制。 */
  refresh(): Promise<void>
  uninstallAll(): void
  /** 诊断用：某个 agent 当前被遮掉的工具名。 */
  deniedToolsOf(agent: unknown): string[]
}

interface Installed {
  /** 这份限制对应的 deny 名单（幂等短路用）。 */
  key: string
  denied: string[]
  dispose: () => void
}

const MCP_TOOL_PREFIX = 'mcp__'

function agentIdOf(agent: unknown): string | number | undefined {
  const id = (agent as { id?: unknown } | undefined)?.id
  if (typeof id === 'string' && id !== '') return id
  return typeof id === 'number' ? id : undefined
}

/**
 * 一个工具名属于哪台服务器。
 *
 * 不靠正则切 `mcp__a__b`（serverName 自己也允许下划线，切不干净），而是拿已知的
 * serverName 去比前缀，取**最长**匹配的那一个。认不出归属的 `mcp__…` 返回 `''`：
 * 它来自别的来源（profile 级 patch 等），对「整套切换」而言同样不属于这个场景。
 */
export function serverOfTool(name: string, serverNames: string[]): string | undefined {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return undefined
  let best: string | undefined
  for (const serverName of serverNames) {
    if (serverName === '') continue
    if (!name.startsWith(`${MCP_TOOL_PREFIX}${serverName}__`)) continue
    if (best === undefined || serverName.length > best.length) best = serverName
  }
  return best ?? ''
}

/**
 * 一个会话当前该被遮掉的工具名（空数组 = 不限制）。
 *
 * 取**有效场景**：会话自己的选择优先，没有就跟随它所在工作区的默认场景。
 */
export async function deniedToolsFor(
  dshHome: string,
  workspace: string,
  toolNames: string[],
  sessionId?: string,
): Promise<{ deny: string[]; scene: string | null }> {
  const target = normaliseWorkspace(workspace)
  if (target === '') return { deny: [], scene: null }

  const state = await loadScenes(dshHome)
  const effective = effectiveSceneOf(state, target, sessionId)
  if (effective.name === null) return { deny: [], scene: null }

  const scene = state.scenes.find((item) => item.name === effective.name)
  // 非整套切换只「加」不减：工具层没有「新增」这个动作，所以不遮任何东西，也不假装遮了。
  if (scene === undefined || scene.exclusive !== true) return { deny: [], scene: effective.name }

  let servers: { id: string; serverName: string }[] = []
  try {
    servers = (await loadMcp(dshHome)).servers
  } catch {
    servers = []
  }
  // 场景里存的是服务器 id；同时认 serverName，迁移过的手写数据也能对上。
  const allowed = new Set(
    servers
      .filter((server) => scene.mcp.some((wanted) => serverMatches(server, wanted)))
      .map((server) => server.serverName)
      .filter((serverName) => serverName !== ''),
  )
  const serverNames = servers.map((server) => server.serverName)

  const deny = toolNames.filter((name) => {
    const owner = serverOfTool(name, serverNames)
    if (owner === undefined) return false          // 不是 MCP 工具，别碰
    if (owner === '') return true                  // 认不出归属的 MCP 工具：整套切换下也不留
    return !allowed.has(owner)
  })
  return { deny, scene: effective.name }
}

export function createSceneGate(options: SceneGateOptions): SceneGate {
  const installed = new Map<string | number, Installed>()
  /**
   * 一次只跑一个安装 / 刷新。
   *
   * 三个触发源会挤在一起（agent/created、tools/change 的防抖刷新、场景写完后主动 refresh）；
   * 同一个 agent 被并发安装两次会装出两层限制、还各留一个 disposer。串起来就没有这个问题，
   * 而且每次安装前都会重算，天然是「以最新状态为准」。
   */
  let queue: Promise<void> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.then(() => undefined, () => undefined)
    return run
  }

  const log = (event: string, detail: string): void => {
    try {
      options.log?.(event, detail)
    } catch {
      /* 记日志不能弄坏闸门 */
    }
  }

  function release(agent: unknown): void {
    const id = agentIdOf(agent)
    if (id === undefined) return
    const current = installed.get(id)
    if (current === undefined) return
    installed.delete(id)
    try {
      current.dispose()
    } catch {
      /* 已经随作用域拆掉了 */
    }
  }

  async function install(agent: unknown): Promise<void> {
    const id = agentIdOf(agent)
    if (id === undefined) return
    const workspace = normaliseWorkspace(options.cwdOf(agent))
    // 没有工作区的会话（无项目 / 临时会话）不参与场景，也就不加限制。
    if (workspace === '') {
      release(agent)
      return
    }
    // 作用域按「对话」算：子代理要用根会话的选择，否则它看不见父会话里选好的场景。
    const sessionId = options.sessionIdOf?.(agent) ?? undefined

    let deny: string[] = []
    try {
      deny = (await deniedToolsFor(options.dshHome, workspace, options.globalToolNames(), sessionId ?? undefined)).deny
    } catch (cause) {
      log('scene-gate', `could not compute the tool gate for ${id}: ${describe(cause)}`)
      return
    }

    const key = [...deny].sort().join('\n')
    const current = installed.get(id)
    if (current !== undefined && current.key === key) return   // 幂等：状态没变就别重挂
    release(agent)
    if (deny.length === 0) return

    const scope = options.toolsScopeOf(agent)
    if (scope === undefined) {
      log('scene-gate', `agent ${id} has no tools service in its scope; MCP tools are not gated`)
      return
    }
    try {
      const dispose = scope.restrict({ deny })
      installed.set(id, { key, denied: deny, dispose })
      log('scene-gate', `agent ${id}: ${deny.length} MCP tool(s) hidden by the active scene`)
    } catch (cause) {
      // 名字在两次读取之间被注销（服务器掉线等）时会走到这里：下一轮 tools/change 会重算。
      log('scene-gate', `restrict() failed for agent ${id}: ${describe(cause)}`)
    }
  }

  async function refresh(): Promise<void> {
    for (const agent of options.liveAgents()) {
      try {
        await install(agent)
      } catch (cause) {
        log('scene-gate', `refresh failed: ${describe(cause)}`)
      }
    }
  }

  return {
    install: (agent: unknown) => serial(() => install(agent)),
    uninstall: release,
    refresh: () => serial(refresh),
    uninstallAll() {
      for (const id of [...installed.keys()]) {
        const current = installed.get(id)
        installed.delete(id)
        try {
          current?.dispose()
        } catch {
          /* 忽略 */
        }
      }
    },
    deniedToolsOf(agent: unknown) {
      const id = agentIdOf(agent)
      return id === undefined ? [] : (installed.get(id)?.denied ?? [])
    },
  }
}
