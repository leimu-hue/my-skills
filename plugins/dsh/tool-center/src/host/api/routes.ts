/**
 * 面板与工具共用的 op 表。
 *
 * 一张扁平的「op 名 → 处理函数」映射。不在表里的一律拒绝（被替换的插件有 79 个 op，
 * 外加一份白名单、一份审计登记表和一份写操作分类器，三者必须互相一致；这里**这张表本身**
 * 就是契约）。
 */
import type { SkillService } from '../skills/service.js'
import { skillRefsOf } from '../skills/policy.js'
import { errorResult, type OpResult } from '../shared/result.js'
import { deletePreset, loadPrompts, readPreset, savePreset, setPresetEnabled } from '../prompts/service.js'
import { deleteMcpServer, loadMcp, setMcpEnabled } from '../mcp/service.js'
import { applyScene, deleteScene, exitScene, loadScenes, saveScene } from '../scenes/service.js'

export type Handler = (payload: Record<string, unknown>) => Promise<OpResult>

/** 宿主技能注册表里的一条摘要（只取核验用得到的字段）。 */
export interface HostSkillSummary {
  name: string
  provider?: string
  invocation?: { modelInvocable?: boolean; userInvocable?: boolean }
}

export interface RouteMeta {
  version: string
  providerName: string
  dshHome: string
  /** 可选作用范围（全局 + 宿主工作区登记表），给提示词域用。 */
  listWorkspaces?: () => { kind: 'global' | 'workspace'; label: string; path: string }[]
  /**
   * 以**宿主注册表**为准的合并目录（`ctx.skills.snapshot`）。
   *
   * 面板自己的视图是「我们打算让宿主看到什么」，而这里拿到的是「宿主最终认为有哪些」——
   * 两者要能对上，用户才敢相信「关掉就不会被用到」。服务不可用时返回 undefined（只降级）。
   */
  snapshotSkills?: (options: { cwd?: string; scope?: string }) => Promise<HostSkillSummary[] | undefined>
}

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const optional = (value: unknown): string | undefined => str(value) || undefined

/** 必填布尔参数：缺失或类型不对时报 `error.args.required`。 */
function requireBool(payload: Record<string, unknown>, key: string): boolean | OpResult {
  const value = payload[key]
  if (typeof value !== 'boolean') return { ok: false, error: `${key} 必须是 true / false`, code: 'error.args.required' }
  return value
}

/** `requireBool` 的结果如果是回执，就直接把它返回给调用方。 */
function isResult(value: boolean | OpResult): value is OpResult {
  return typeof value !== 'boolean'
}

export function createHandlers(service: SkillService, meta: RouteMeta): Record<string, Handler> {
  /** 提示词 / MCP / 场景域：把领域异常翻成 op 回执。 */
  const domainCall = async (task: () => Promise<OpResult>): Promise<OpResult> => {
    try {
      return await task()
    } catch (cause) {
      return errorResult(cause)
    }
  }

  return {
    /** 面板渲染一次所需的全部数据。 */
    state: async (payload) => ({
      ok: true,
      data: await service.view(optional(payload.cwd), optional(payload.scope)),
    }),

    /* ------------------------------ 提示词 ------------------------------ */

    'prompt-state': async () => domainCall(async () => ({
      ok: true,
      data: await loadPrompts(meta.dshHome),
    })),

    /** 可选作用范围：全局 + 宿主工作区登记表里的工作区（不是猜的）。 */
    'prompt-targets': async () => domainCall(async () => ({
      ok: true,
      data: { options: meta.listWorkspaces?.() ?? [] },
    })),

    /** 启用 / 停用一份预设（它自带作用范围）。 */
    'prompt-toggle': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return domainCall(async () => ({
        ok: true,
        data: await setPresetEnabled(meta.dshHome, str(payload.name), enabled),
      }))
    },

    'prompt-read': async (payload) => domainCall(async () => ({
      ok: true,
      data: { name: str(payload.name), content: await readPreset(meta.dshHome, str(payload.name)) },
    })),

    'prompt-save': async (payload) => domainCall(async () => ({
      ok: true,
      data: await savePreset(meta.dshHome, str(payload.name), str(payload.content), payload.scope),
    })),

    'prompt-delete': async (payload) => domainCall(async () => {
      await deletePreset(meta.dshHome, str(payload.name))
      return { ok: true, data: { name: str(payload.name) } }
    }),

    /** 兼容旧调用：等价于启用 / 停用。 */
    'prompt-apply': async (payload) => domainCall(async () => ({
      ok: true,
      data: await setPresetEnabled(meta.dshHome, str(payload.name), true),
    })),

    'prompt-unapply': async (payload) => domainCall(async () => ({
      ok: true,
      data: await setPresetEnabled(meta.dshHome, str(payload.name), false),
    })),

    /* -------------------------------- MCP -------------------------------- */

    'mcp-state': async () => domainCall(async () => ({ ok: true, data: await loadMcp(meta.dshHome) })),

    'mcp-toggle': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return domainCall(async () => ({
        ok: true,
        data: await setMcpEnabled(meta.dshHome, str(payload.id), enabled),
      }))
    },

    'mcp-delete': async (payload) => domainCall(async () => ({
      ok: true,
      data: await deleteMcpServer(meta.dshHome, str(payload.id)),
    })),

    /* ------------------------------- 场景 ------------------------------- */

    'scene-state': async () => domainCall(async () => ({ ok: true, data: await loadScenes(meta.dshHome) })),

    'scene-save': async (payload) => domainCall(async () => ({
      ok: true,
      data: await saveScene(meta.dshHome, {
        name: str(payload.name),
        description: payload.description === undefined ? undefined : str(payload.description),
        skills: payload.skills === undefined ? undefined : skillRefsOf(payload.skills),
        mcp: Array.isArray(payload.mcp) ? payload.mcp.filter((id): id is string => typeof id === 'string') : undefined,
        prompt: payload.prompt === undefined ? undefined : str(payload.prompt) || null,
        promptTarget: payload.promptTarget,
        exclusive: payload.exclusive === undefined ? undefined : payload.exclusive === true,
      }),
    })),

    'scene-delete': async (payload) => domainCall(async () => {
      await deleteScene(meta.dshHome, str(payload.name))
      return { ok: true, data: { name: str(payload.name) } }
    }),

    'scene-apply': async (payload) => domainCall(async () => ({
      ok: true,
      data: await applyScene(meta.dshHome, service, optional(payload.cwd), str(payload.name)),
    })),

    'scene-exit': async () => domainCall(async () => ({
      ok: true,
      data: await exitScene(meta.dshHome, service),
    })),

    /* ------------------------------- 技能 ------------------------------- */

    detail: async (payload) => service.detail(str(payload.root), str(payload.name), optional(payload.cwd)),

    'set-skill': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return service.setSkill(str(payload.root), str(payload.name), enabled, optional(payload.cwd), optional(payload.scope))
    },


    'set-source': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return service.setSource(str(payload.root), enabled, optional(payload.scope), optional(payload.cwd))
    },

    /**
     * 以宿主注册表为准核验一条技能「到底还在不在模型面前」。
     *
     * 关闭技能不是删文件，而是由我们发布一条 rank 更低、`modelInvocable:false` 的覆盖候选；
     * 所以「真的关掉了吗」只有一个可信答案来源：宿主合并后的目录。这里就是去问它。
     */
    verify: async (payload) => domainCall(async () => {
      const name = str(payload.name)
      if (name === '') return { ok: false, error: 'name 不能为空', code: 'error.args.required' }
      if (meta.snapshotSkills === undefined) {
        return { ok: false, error: '宿主技能服务不可用，无法核验', code: 'error.verify.unavailable' }
      }
      const skills = await meta.snapshotSkills({ cwd: optional(payload.cwd), scope: optional(payload.scope) })
      if (skills === undefined) {
        return { ok: false, error: '宿主技能服务不可用，无法核验', code: 'error.verify.unavailable' }
      }
      const hit = skills.find((skill) => skill.name === name)
      if (hit === undefined) {
        return { ok: true, data: { name, inCatalog: false, modelInvocable: false, userInvocable: false } }
      }
      return {
        ok: true,
        data: {
          name,
          inCatalog: true,
          modelInvocable: hit.invocation?.modelInvocable === true,
          userInvocable: hit.invocation?.userInvocable === true,
          provider: hit.provider,
        },
      }
    }),

    'remove-source': async (payload) => service.setRemoved(
      str(payload.root),
      payload.removed !== false,
      optional(payload.cwd),
    ),

    prefer: async (payload) => {
      const preferred = requireBool(payload, 'preferred')
      if (isResult(preferred)) return preferred
      return service.prefer(str(payload.root), str(payload.name), preferred)
    },

    create: async (payload) => service.create(
      str(payload.root) || 'local',
      {
        name: str(payload.name),
        description: str(payload.description),
        body: str(payload.body),
        whenToUse: optional(payload.whenToUse),
      },
      optional(payload.cwd),
    ),

    update: async (payload) => service.update(
      str(payload.root),
      str(payload.name),
      {
        description: payload.description === undefined ? undefined : str(payload.description),
        body: payload.body === undefined ? undefined : str(payload.body),
        whenToUse: payload.whenToUse === undefined ? undefined : str(payload.whenToUse),
        name: payload.newName === undefined ? undefined : str(payload.newName),
      },
      optional(payload.cwd),
    ),

    remove: async (payload) => service.remove(str(payload.root), str(payload.name), optional(payload.cwd)),

    'trash-list': async () => service.trashList(),
    'trash-restore': async (payload) => service.trashRestore(str(payload.id)),
    'trash-purge': async (payload) => service.trashPurge(str(payload.id)),
    'trash-empty': async () => service.trashEmpty(),

    /** 对外 API：面板没有入口，留给脚本 / 其它插件管理自定义来源。 */
    'roots-add': async (payload) => service.addRoot(str(payload.path), optional(payload.label)),
    'roots-remove': async (payload) => service.removeRoot(str(payload.key)),


    /** 只看不写：列出压缩包里可导入的技能，供面板勾选。 */
    'import-scan': async (payload) => service.scanImport(
      str(payload.root) || 'import',
      str(payload.base64),
      optional(payload.cwd),
    ),

    /** `names` 给了就只导入这些（面板勾选结果）；不给等于全导入。 */
    'import-zip': async (payload) => service.importZip(
      str(payload.root) || 'import',
      str(payload.base64),
      optional(payload.cwd),
      Array.isArray(payload.names) ? payload.names.filter((name): name is string => typeof name === 'string') : undefined,
    ),

    'export-zip': async (payload) => {
      const items = skillRefsOf(payload.items)
      return service.exportZip(items.length > 0 ? items : undefined, optional(payload.cwd))
    },

    refresh: async () => service.refresh(),

    /** 版本 / 路径 / provider 健康信息，给面板页脚用。 */
    health: async () => {
      const info = service.stateInfo()
      return {
        ok: true,
        data: {
          version: meta.version,
          provider: meta.providerName,
          statePath: service.statePath,
          state: info ?? null,
          invalidators: service.invalidators.size,
        },
      }
    },
  }
}

/** 只读的 op；其余的都会写，可能被宿主门禁拦。 */
export const READ_OPS = new Set([
  'state', 'detail', 'trash-list', 'export-zip', 'health', 'import-scan',
  'prompt-state', 'prompt-read', 'prompt-targets', 'mcp-state', 'scene-state',
])
