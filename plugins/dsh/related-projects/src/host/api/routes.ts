/**
 * Client UI 访问的插件自有 JSON 路由：每个方法一个处理器。
 *
 * 变更策略就在这里：调用方要求时（`notify: true`，由面板和工具发送），一次变更会
 * 向该 workspace 的存活会话追加一个快照。追加可保住已缓存的提示词前缀，
 * 因为冻结的 system 小节永不被重写——见 prompt/sessions.ts。
 *
 * 变更只回答它改了什么，而不是整份新状态：Client 会重新读取 `state`
 * （它本来就需要刷新后的 workspace 行），所以每次写入再捎一份完整快照，
 * 只会多花文件系统的 stat 和字节。
 */
import { RegistryError } from '../shared/errors.js'
import { normalizePath } from '../shared/paths.js'
import { directoryTarget, listDirectory, searchProjects } from '../files/service.js'
import type { ProjectRoot } from '../files/service.js'
import { describeUpdate, sectionText, boundaryText } from '../prompt/text.js'
import { canonicalWorkspace, directoryPickerOf, sandboxModeOf, sessionOf, workspaceOfSession, workspaceRows } from '../workspace/service.js'
import type { HostContext } from '../shared/context.js'
import type { Registry } from '../registry/service.js'
import type { SessionRegistry } from '../prompt/sessions.js'
import type { StateValue } from '../shared/types.js'

type Payload = Record<string, unknown>

export type Handler = (payload: Payload) => Promise<unknown>

export interface HandlerDeps {
  ctx: HostContext
  registry: Registry
  sessions: SessionRegistry
  openInFileManager(path: string): void
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function limitOf(payload: Payload): number | undefined {
  return typeof payload.limit === 'number' ? payload.limit : undefined
}

/** `files` / `list` 请求可以遍历的项目根目录。 */
function rootsOf(registry: Registry, workspace: string): ProjectRoot[] {
  return registry.readable(workspace).present.map((project) => ({ path: project.path, name: project.name }))
}

export function createHandlers(deps: HandlerDeps): Record<string, Handler> {
  const { ctx, registry, sessions } = deps

  /**
   * 目标 workspace：优先用显式路径，否则用发起请求的会话。
   * 两者都需要——面板知道路径，composer 行只知道自己的会话，而靠猜会为一个
   * 还没有分组的 workspace 报出 `workspace-missing`。
   */
  const workspaceOf = (payload: Payload): string => {
    const explicit = str(payload.workspace)
    /* 调用方拿到目录的时间可能早于本 Host 能解析出该会话的时间：冷（旧）会话的
       `header.cwd` 要等它开始 resume 才可读，而 Client 自己的会话目录早已知道。
       把这个提示折算到注册时使用的写法上，让两条路径的结论一致。 */
    if (explicit !== '') return canonicalWorkspace(ctx, explicit)
    return workspaceOfSession(ctx, sessionOf(ctx, payload.sessionId))
  }

  const requireWorkspace = (payload: Payload): string => {
    const workspace = workspaceOf(payload)
    if (workspace === '') throw new RegistryError('workspace-missing')
    return workspace
  }

  /* 变更以快照形式追加到存活会话，绝不塞进 system 小节（那一节为复用缓存保持冻结）。
     `notify: true`——面板和工具发送的就是它——才是让这个快照生效的开关。 */
  const announce = (workspace: string, summary: string, notify: unknown): void => {
    if (notify !== true) return
    sessions.notify(workspace, summary)
  }

  return {
    async state(payload): Promise<StateValue> {
      /* 优先用显式路径，否则用发起请求的会话——与其他每个方法同一规则。composer
         行需要这一点：打开一个旧会话时，composer 会在该会话存活之前挂载，只凭 id
         会答 "workspace unknown"，而 Client 早已从自己的会话目录知道了那个目录。 */
      const groups = registry.groups()
      return {
        ...registry.snapshot(workspaceOf(payload)),
        groups,
        workspaces: workspaceRows(ctx, groups),
      }
    },

    /* related projects 里的文件，供 `@` 菜单使用：内置的文件源受 Agent 工作目录限制，
       而这些项目是它之外的兄弟目录。只读且有上限——见 files/service.ts。 */
    async files(payload) {
      const query = str(payload.query)
      if (query.trim() === '') return { rows: [] }
      return { rows: searchProjects(rootsOf(registry, workspaceOf(payload)), query, limitOf(payload)) }
    },

    /* 一次下钻：该目录必须位于此 workspace 的某个 related project 之内，
       然后列出它的子项（见 `directoryTarget`）。 */
    async list(payload) {
      const dir = normalizePath(str(payload.dir))
      if (dir === '') throw new RegistryError('not-directory')
      const target = directoryTarget(rootsOf(registry, workspaceOf(payload)), dir)
      /* 不是 'no-group'：该 workspace 可能本来就有项目——只是这个目录不在其中任何
         一个里面，UI 必须能区分这两种情况。 */
      if (target === null) throw new RegistryError('outside-project')
      return listDirectory(target.root, target.rel, str(payload.filter), limitOf(payload))
    },

    async add(payload) {
      const workspace = requireWorkspace(payload)
      const project = registry.add(workspace, {
        path: payload.path,
        name: payload.name,
        note: payload.note,
        origin: payload.origin,
      })
      announce(workspace, 'added ' + project.name + ' (' + project.path + ')', payload.notify)
      return { project }
    },

    async update(payload) {
      const workspace = requireWorkspace(payload)
      const before = registry.findProject(workspace, payload.id)
      const project = registry.update(workspace, payload.id, payload.patch)
      announce(workspace, before === undefined ? 'updated ' + project.name : describeUpdate(before, project), payload.notify)
      return { project }
    },

    async remove(payload) {
      const workspace = requireWorkspace(payload)
      const name = registry.remove(workspace, payload.id)
      announce(workspace, 'removed ' + name, payload.notify)
      return { removed: name }
    },

    async copy(payload) {
      const result = registry.copy(payload.from, payload.to)
      announce(
        canonicalWorkspace(ctx, str(payload.to)),
        'copied ' + String(result.added) + ' project(s) from another workspace',
        payload.notify,
      )
      return result
    },

    async settings(payload) {
      return { settings: registry.setSettings(payload) }
    },

    async open(payload) {
      const target = registry.findProject(requireWorkspace(payload), payload.id)
      if (target === undefined) throw new RegistryError('no-project')
      deps.openInFileManager(target.path)
      return { opened: true }
    },

    async pick() {
      const picker = directoryPickerOf(ctx)
      if (picker === undefined) throw new RegistryError('pick-unavailable')
      const picked = await picker.pick(new AbortController().signal)
      return { path: picked === null || picked === undefined ? '' : picked }
    },

    /**
     * 诊断：该会话启动时冻结的小节（模型 system prompt 里的内容），以及已追加了
     * 多少份变更快照。`current` 是一个新会话此刻会渲染出的内容——便于看出
     * 通知想要弥合的那点差异。
     */
    async prompt(payload) {
      const session = sessionOf(ctx, payload.sessionId)
      const workspace = session === undefined ? str(payload.workspace) : workspaceOfSession(ctx, session)
      const current = sectionText(registry, workspace, boundaryText(sandboxModeOf(ctx, session)))
      const described = typeof payload.sessionId === 'string'
        ? sessions.describe(payload.sessionId)
        : { attached: false, section: 'no-session', notices: 0 }
      return {
        workspace,
        current,
        bytes: Buffer.byteLength(current),
        attached: described.attached,
        section: described.section,
        notices: described.notices,
        liveSessions: sessions.size,
      }
    },
  }
}
