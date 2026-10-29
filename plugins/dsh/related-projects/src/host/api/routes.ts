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
import { directoryTarget } from '../files/service.js'
import type { FileSearch, ProjectRoot } from '../files/service.js'
import { boundaryText, describeUpdate, sectionText } from '../prompt/text.js'
import { canonicalWorkspace, nativePicker, sandboxModeOf, sessionOf, workspaceOfSession, workspaceRows } from '../workspace/service.js'
import type { Context } from '@deepseek-ai/cordis'
import type { Registry } from '../registry/service.js'
import type { SessionRegistry } from '../prompt/sessions.js'
import type { StateValue } from '../shared/types.js'

type Payload = Record<string, unknown>

/**
 * `signal` 在请求方掉线时中止：菜单每按一个键就发一次请求，没人看的那次
 * 不该继续替一份可能很大的索引跑遍历。
 */
export type Handler = (payload: Payload, signal: AbortSignal) => Promise<unknown>

export interface HandlerDeps {
  ctx: Context
  registry: Registry
  sessions: SessionRegistry
  files: FileSearch
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
  const { ctx, registry, sessions, files } = deps

  /**
   * 目标 workspace：显式路径优先（面板知道路径），否则由会话解析（composer 行
   * 只知道自己）。两者都需要，因为只靠猜会为一个还没有分组的 workspace 报出
   * `workspace-missing`。
   */
  const workspaceOf = (payload: Payload): string => {
    const explicit = str(payload.workspace)
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
      /* 与其他方法同一规则：显式路径优先，否则由会话解析。composer 行打开旧会话时
         会在该会话存活之前挂载，这段时间它拿到的就是「工作区未知」。 */
      const groups = registry.groups()
      return {
        ...registry.snapshot(workspaceOf(payload)),
        groups,
        workspaces: workspaceRows(ctx, groups),
      }
    },

    /* related projects 里的文件，供 `@` 菜单使用：内置的文件源受 Agent 工作目录限制，
       而这些项目是它之外的兄弟目录。只读且有上限——见 files/service.ts。 */
    async files(payload, signal) {
      const query = str(payload.query)
      if (query.trim() === '') return { rows: [] }
      return { rows: await files.search(rootsOf(registry, workspaceOf(payload)), query, limitOf(payload), signal) }
    },

    /* 一次下钻：该目录必须位于此 workspace 的某个 related project 之内，
       然后列出它的子项（见 `directoryTarget`）。 */
    async list(payload, signal) {
      const dir = normalizePath(str(payload.dir))
      if (dir === '') throw new RegistryError('not-directory')
      const target = directoryTarget(rootsOf(registry, workspaceOf(payload)), dir)
      /* 不是 'no-group'：该 workspace 可能本来就有项目——只是这个目录不在其中任何
         一个里面，UI 必须能区分这两种情况。 */
      if (target === null) throw new RegistryError('outside-project')
      return files.list(target.root, target.rel, str(payload.filter), limitOf(payload), signal)
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
      /* 删之前先记下路径：它的索引也要跟着走，否则内存里会留一份没人认领的条目。 */
      const target = registry.findProject(workspace, payload.id)
      const name = registry.remove(workspace, payload.id)
      if (target !== undefined) files.forget(target.path)
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
      /* 只有 native 后端能在宿主显示器上弹出系统目录选择器；browse 后端由界面
         自己列目录，所以这里按官方默认“隐藏选择能力”。 */
      const capability = nativePicker(ctx)
      if (capability === undefined) throw new RegistryError('pick-unavailable')
      const picked = await capability.pick(new AbortController().signal)
      return { path: picked === null ? '' : picked }
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
