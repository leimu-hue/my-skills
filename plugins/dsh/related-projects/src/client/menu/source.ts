/**
 * `@` 菜单源：官方 trigger 菜单中的关联项目（及其文件）。
 *
 * 源本身刻意保持精简——契约由 `dsh-client-ui-input-trigger` 定义（见
 * `InputTriggerSource`），查询解析在 `query.ts`，行形状在 `rows.ts`。留在这里的
 * 是状态：每个会话一份项目列表缓存，以及菜单需要的几个回调。
 */
import type {
  InputTriggerCandidate,
  InputTriggerCrumb,
  InputTriggerSource,
  PickOutcome,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { call, sessionPayload } from '../core/api.js'
import { atToken, referenceOf } from '../core/reference.js'
import type { Translate } from '../i18n/index.js'
import type { FileHit, ProjectView, StateValue } from '../core/types.js'
import { directoryTarget, rankProjects } from './query.js'
import { drillValue, levelRows, parseRowValue, projectRows } from './rows.js'

/**
 * 稳定的源标识。管线依据 `name` 把恢复后的 chip 路由回它的源，
 * 因此这个值绝不能依赖当前 locale：否则中文写下的草稿在切到英文后
 * 将无法继续解析。可见标题改由每一行的 `section` 提供（当行携带
 * section 时，管线会抑制由 name 推导出的分组标题）。
 */
const SOURCE_KEY = 'related-projects'

const TRIGGER = '@'
/* 管线按 `order ?? 0` 升序排列各源。同时承载文件与会话行的随附 `@` 源
   （"reference"）没有声明 order，因此按 0 排序——order 为 1 会把本组排到它
   后面，也就是菜单底部。“本次改动触及的项目”应当是空查询时菜单最先展示
   的内容，因此本组严格排在零之前。 */
const ORDER = -10
const CACHE_TTL_MS = 10_000

interface Cached {
  at: number
  projects: ProjectView[]
}

/** 每个插件实例一个源对象；项目列表按会话缓存。 */
export function createTriggerSource(t: Translate): InputTriggerSource {
  const cache = new Map<string, Cached>()

  const load = async (sessionId: string): Promise<ProjectView[]> => {
    const hit = cache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.projects
    const state = await call<StateValue>('state', sessionPayload(sessionId))
    /* 只能提供已启用且仍然存在的目录：无法打开的行会白白消耗一次 pick。 */
    const projects = state.projects.filter((project) => project.enabled && project.exists)
    /* “工作区尚不可解析”不等于“此工作区没有项目”：未解析的应答
       绝不能写入缓存，否则对于恢复仍在进行中的会话，菜单会一直为空。 */
    if (state.workspace !== null) cache.set(sessionId, { at: Date.now(), projects })
    return projects
  }

  /**
   * 取一批行（`files` 搜索 / `list` 列一层）。永不抛错：即使菜单连不上 Host，
   * 也仍会显示项目根，因此一次失败的请求不能拖垮整个分组。
   */
  const rowsOf = async (method: string, payload: Record<string, unknown>): Promise<FileHit[]> => {
    try {
      const answer = await call<{ rows?: FileHit[] }>(method, payload)
      return Array.isArray(answer.rows) ? answer.rows : []
    } catch {
      return []
    }
  }

  return {
    trigger: TRIGGER,
    name: SOURCE_KEY,
    showGroupTitle: false,
    order: ORDER,

    async candidates(session, request): Promise<readonly InputTriggerCandidate[]> {
      const sessionId = String(session.sessionId)
      /* 连工作区都获知不了的菜单不能阻塞其他分组：
         注册表不可用时静默地不产生任何行。 */
      let projects: ProjectView[]
      try {
        projects = await load(sessionId)
      } catch {
        return []
      }
      if (request.signal.aborted) return []
      const query = request.query

      /* 正站在某个项目目录内：只列出该层级，这样一进入“需求开发”
         就显示它包含的内容——而不是把整棵树压平后一股脑列出。 */
      const target = directoryTarget(projects, query)
      if (target !== null) {
        const rows = levelRows(
          await rowsOf('list', sessionPayload(sessionId, { dir: target.dir, filter: target.filter })),
          t('menu.files'),
        )
        return request.signal.aborted ? [] : rows
      }

      const rows = projectRows(rankProjects(projects, query), t('panel.title'))
      /* 输入文字会问出项目根回答不了的第二个问题：“这些项目下的哪一项”。
         Host 对每个项目只建一次索引，并按名称应答，因此匹配的目录会作为
         一个可 drill 的行出现，而不会把它的内容一起拖出来。 */
      if (query.trim() !== '') {
        rows.push(...levelRows(await rowsOf('files', sessionPayload(sessionId, { query })), t('menu.files')))
      }
      return request.signal.aborted ? [] : rows
    },

    /* drill 位置的面包屑：先是项目，然后是每一级目录段。
       只在菜单确实由 drill 打开时发布，与随附源限定其 header 的方式一致。 */
    header(session, request): readonly InputTriggerCrumb[] | undefined {
      if (request.drilled !== true) return undefined
      const projects = cache.get(String(session.sessionId))?.projects ?? []
      const target = directoryTarget(projects, request.query)
      if (target === null) return undefined
      const root = referenceOf(target.project.path, false)
      const dir = referenceOf(target.dir, false)
      const crumbs: InputTriggerCrumb[] = [
        { label: target.project.name, value: drillValue(target.project.name, root) },
      ]
      const rest = dir.slice(root.length).replace(/^\/+/, '')
      if (rest !== '') {
        const segments = rest.split('/')
        for (const [index, segment] of segments.entries()) {
          const path = root + '/' + segments.slice(0, index + 1).join('/')
          crumbs.push({ label: segment, value: drillValue(segment, path) })
        }
      }
      /* 最深的面包屑就是用户当前所在的位置。 */
      const last = crumbs[crumbs.length - 1]
      if (last === undefined) return crumbs
      return [...crumbs.slice(0, -1), { ...last, current: true }]
    },

    /* 在 warm 时预取，这样会话中的第一个 `@` 不必再等一次往返。 */
    warm(session) {
      void load(String(session.sessionId)).catch(() => undefined)
    },

    onPick(pick): PickOutcome {
      /* 行的不透明 `value` 携带精确路径——与随附文件源使用同一契约。
         恢复时缺少它的行会回退到描述开头的路径，而描述开头始终是项目路径。 */
      const payload = parseRowValue(pick.candidate.value)
      const fromDescription = (pick.candidate.description ?? '').split('  ·  ')[0]
      const absolute = payload?.mention ?? referenceOf(fromDescription, true)
      const name = payload?.label ?? pick.candidate.name
      const directory = payload === null ? true : payload.kind !== 'file'
      const token = atToken(absolute)

      /* drill 会把草稿改写为目录引用，并在该目录重新打开菜单；
         pick 则把引用作为 chip 插入。目录行两者都支持，与随附文件源完全一致。 */
      if (directory && pick.action === 'drill') return { text: token, continue: true }
      return {
        insert: {
          source: SOURCE_KEY,
          ref: absolute,
          label: directory ? name + '/' : name,
          appearance: directory ? 'folder' : 'file',
          clipboardText: token,
        },
      }
    },

    codec: {
      /* `ref` 已经携带目录的斜杠约定，因此两个 codec 都不能再加一个：
         文件引用绝不能长出尾随斜杠。 */
      clipboardText: (ref) => atToken(ref),
      serialize: (ref) => Promise.resolve(atToken(ref)),
    },

    /* 名称是草稿中纯 `@name` 文本的可着色 token。 */
    lexicon(session) {
      const hit = cache.get(String(session.sessionId))
      return hit === undefined ? undefined : hit.projects.map((project) => project.name)
    },
  }
}
