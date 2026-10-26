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

export interface RouteMeta {
  version: string
  providerName: string
  dshHome: string
  /** 可选作用范围（全局 + 宿主工作区登记表），给提示词域用。 */
  listWorkspaces?: () => { kind: 'global' | 'workspace'; label: string; path: string }[]
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

    'set-all': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return service.setAll(skillRefsOf(payload.items), enabled, optional(payload.cwd), optional(payload.scope))
    },

    'set-source': async (payload) => {
      const enabled = requireBool(payload, 'enabled')
      if (isResult(enabled)) return enabled
      return service.setSource(str(payload.root), enabled, optional(payload.scope), optional(payload.cwd))
    },

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

    'roots-add': async (payload) => service.addRoot(str(payload.path), optional(payload.label)),
    'roots-remove': async (payload) => service.removeRoot(str(payload.key)),

    'import-path': async (payload) => service.importPath(str(payload.root) || 'import', str(payload.path), optional(payload.cwd)),

    'import-zip': async (payload) => service.importZip(str(payload.root) || 'import', str(payload.base64), optional(payload.cwd)),

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
  'state', 'detail', 'trash-list', 'export-zip', 'health',
  'prompt-state', 'prompt-read', 'prompt-targets', 'mcp-state', 'scene-state',
])
