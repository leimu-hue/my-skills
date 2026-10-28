import { skillRefsOf } from '../skills/policy.js';
import { errorResult } from '../shared/result.js';
import { deletePreset, loadPrompts, readPreset, savePreset, setPresetEnabled } from '../prompts/service.js';
import { deleteMcpServer, loadMcp, setMcpEnabled } from '../mcp/service.js';
import { deleteScene, loadScenes, saveScene, setSessionScene, setWorkspaceScene } from '../scenes/service.js';
const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const optional = (value) => str(value) || undefined;
/** 必填布尔参数：缺失或类型不对时报 `error.args.required`。 */
function requireBool(payload, key) {
    const value = payload[key];
    if (typeof value !== 'boolean')
        return { ok: false, error: `${key} 必须是 true / false`, code: 'error.args.required' };
    return value;
}
/** `requireBool` 的结果如果是回执，就直接把它返回给调用方。 */
function isResult(value) {
    return typeof value !== 'boolean';
}
export function createHandlers(service, meta) {
    /** 提示词 / MCP / 场景域：把领域异常翻成 op 回执。 */
    const domainCall = async (task) => {
        try {
            return await task();
        }
        catch (cause) {
            return errorResult(cause);
        }
    };
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
            const enabled = requireBool(payload, 'enabled');
            if (isResult(enabled))
                return enabled;
            return domainCall(async () => ({
                ok: true,
                data: await setPresetEnabled(meta.dshHome, str(payload.name), enabled),
            }));
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
            await deletePreset(meta.dshHome, str(payload.name));
            return { ok: true, data: { name: str(payload.name) } };
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
            const enabled = requireBool(payload, 'enabled');
            if (isResult(enabled))
                return enabled;
            return domainCall(async () => ({
                ok: true,
                data: await setMcpEnabled(meta.dshHome, str(payload.id), enabled),
            }));
        },
        'mcp-delete': async (payload) => domainCall(async () => ({
            ok: true,
            data: await deleteMcpServer(meta.dshHome, str(payload.id)),
        })),
        /* ------------------------------- 场景 ------------------------------- */
        'scene-state': async () => domainCall(async () => ({ ok: true, data: await loadScenes(meta.dshHome) })),
        'scene-save': async (payload) => domainCall(async () => {
            const data = await saveScene(meta.dshHome, {
                name: str(payload.name),
                description: payload.description === undefined ? undefined : str(payload.description),
                skills: payload.skills === undefined ? undefined : skillRefsOf(payload.skills),
                mcp: Array.isArray(payload.mcp) ? payload.mcp.filter((id) => typeof id === 'string') : undefined,
                prompt: payload.prompt === undefined ? undefined : str(payload.prompt) || null,
                exclusive: payload.exclusive === undefined ? undefined : payload.exclusive === true,
            });
            meta.scenesChanged?.();
            return { ok: true, data };
        }),
        'scene-delete': async (payload) => domainCall(async () => {
            await deleteScene(meta.dshHome, str(payload.name));
            meta.scenesChanged?.();
            return { ok: true, data: { name: str(payload.name) } };
        }),
        /** 某个工作区用哪个场景：`scene: null` = 这个工作区不用场景。 */
        'scene-workspace': async (payload) => domainCall(async () => {
            const scene = typeof payload.scene === 'string' && payload.scene !== '' ? payload.scene : null;
            const data = await setWorkspaceScene(meta.dshHome, service, str(payload.workspace), scene);
            meta.scenesChanged?.();
            return { ok: true, data };
        }),
        /**
         * 某个会话用哪个场景。
         *
         * `scene` 缺省 = 跟随工作区（删掉会话选择）；`null` = 这个会话明确不用；名字 = 用这个场景。
         */
        'scene-session': async (payload) => domainCall(async () => {
            const scene = payload.scene === undefined
                ? undefined
                : (typeof payload.scene === 'string' && payload.scene !== '' ? payload.scene : null);
            const sessionId = str(payload.sessionId);
            const workspace = str(payload.workspace) || (meta.sessionCwd?.(sessionId) ?? '');
            const data = await setSessionScene(meta.dshHome, service, sessionId, workspace, scene);
            meta.scenesChanged?.();
            return { ok: true, data };
        }),
        /* ------------------------------- 技能 ------------------------------- */
        detail: async (payload) => service.detail(str(payload.root), str(payload.name), optional(payload.cwd)),
        'set-skill': async (payload) => {
            const enabled = requireBool(payload, 'enabled');
            if (isResult(enabled))
                return enabled;
            return service.setSkill(str(payload.root), str(payload.name), enabled, optional(payload.cwd), optional(payload.scope));
        },
        'set-source': async (payload) => {
            const enabled = requireBool(payload, 'enabled');
            if (isResult(enabled))
                return enabled;
            return service.setSource(str(payload.root), enabled, optional(payload.scope), optional(payload.cwd));
        },
        /**
         * 以宿主注册表为准核验一条技能「到底还在不在模型面前」。
         *
         * 关闭技能不是删文件，而是由我们发布一条 rank 更低、`modelInvocable:false` 的覆盖候选；
         * 所以「真的关掉了吗」只有一个可信答案来源：宿主合并后的目录。这里就是去问它。
         */
        verify: async (payload) => domainCall(async () => {
            const name = str(payload.name);
            if (name === '')
                return { ok: false, error: 'name 不能为空', code: 'error.args.required' };
            if (meta.snapshotSkills === undefined) {
                return { ok: false, error: '宿主技能服务不可用，无法核验', code: 'error.verify.unavailable' };
            }
            const skills = await meta.snapshotSkills({ cwd: optional(payload.cwd), scope: optional(payload.scope) });
            if (skills === undefined) {
                return { ok: false, error: '宿主技能服务不可用，无法核验', code: 'error.verify.unavailable' };
            }
            const hit = skills.find((skill) => skill.name === name);
            if (hit === undefined) {
                return { ok: true, data: { name, inCatalog: false, modelInvocable: false, userInvocable: false } };
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
            };
        }),
        'remove-source': async (payload) => service.setRemoved(str(payload.root), payload.removed !== false, optional(payload.cwd)),
        prefer: async (payload) => {
            const preferred = requireBool(payload, 'preferred');
            if (isResult(preferred))
                return preferred;
            return service.prefer(str(payload.root), str(payload.name), preferred);
        },
        create: async (payload) => service.create(str(payload.root) || 'local', {
            name: str(payload.name),
            description: str(payload.description),
            body: str(payload.body),
            whenToUse: optional(payload.whenToUse),
        }, optional(payload.cwd)),
        update: async (payload) => service.update(str(payload.root), str(payload.name), {
            description: payload.description === undefined ? undefined : str(payload.description),
            body: payload.body === undefined ? undefined : str(payload.body),
            whenToUse: payload.whenToUse === undefined ? undefined : str(payload.whenToUse),
            name: payload.newName === undefined ? undefined : str(payload.newName),
        }, optional(payload.cwd)),
        remove: async (payload) => service.remove(str(payload.root), str(payload.name), optional(payload.cwd)),
        'trash-list': async () => service.trashList(),
        'trash-restore': async (payload) => service.trashRestore(str(payload.id)),
        'trash-purge': async (payload) => service.trashPurge(str(payload.id)),
        'trash-empty': async () => service.trashEmpty(),
        /** 对外 API：面板没有入口，留给脚本 / 其它插件管理自定义来源。 */
        'roots-add': async (payload) => service.addRoot(str(payload.path), optional(payload.label)),
        'roots-remove': async (payload) => service.removeRoot(str(payload.key)),
        /** 只看不写：列出压缩包里可导入的技能，供面板勾选。 */
        'import-scan': async (payload) => service.scanImport(str(payload.root) || 'import', str(payload.base64), optional(payload.cwd)),
        /** `names` 给了就只导入这些（面板勾选结果）；不给等于全导入。 */
        'import-zip': async (payload) => service.importZip(str(payload.root) || 'import', str(payload.base64), optional(payload.cwd), Array.isArray(payload.names) ? payload.names.filter((name) => typeof name === 'string') : undefined),
        'export-zip': async (payload) => {
            const items = skillRefsOf(payload.items);
            return service.exportZip(items.length > 0 ? items : undefined, optional(payload.cwd));
        },
        refresh: async () => service.refresh(),
        /** 版本 / 路径 / provider 健康信息，给面板页脚用。 */
        health: async () => {
            const info = service.stateInfo();
            return {
                ok: true,
                data: {
                    version: meta.version,
                    provider: meta.providerName,
                    statePath: service.statePath,
                    state: info ?? null,
                    invalidators: service.invalidators.size,
                },
            };
        },
    };
}
/** 只读的 op；其余的都会写，可能被宿主门禁拦。 */
export const READ_OPS = new Set([
    'state', 'detail', 'trash-list', 'export-zip', 'health', 'import-scan',
    'prompt-state', 'prompt-read', 'prompt-targets', 'mcp-state', 'scene-state',
]);
