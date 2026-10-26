/**
 * 工作区身份与能力：「我在哪个工作区」「我能写什么」，
 * 以及「DSH 会列出哪些工作区」。
 *
 * 每个探测都降级而不是抛错——Host 缺少其中某个服务时，
 * 调用方只会拿到 '' / null，或者只剩分组。
 */
import { sessionService, sandboxService, workspaceRegistry, directoryPicker } from '../shared/context.js';
import { normalizePath, workspaceKey } from '../shared/paths.js';
export function sessionOf(ctx, id) {
    if (typeof id !== 'string' || id === '')
        return undefined;
    const service = sessionService(ctx);
    if (service === undefined || typeof service.get !== 'function')
        return undefined;
    try {
        return service.get(id);
    }
    catch {
        return undefined;
    }
}
/**
 * 工作区的规范形态：`workspace.path` 是创建时铸入的 realpath 戳，
 * 而 `session.header.cwd` 只保证是绝对路径——所以优先用注册时的写法，
 * 拿不到再退回会话自己的目录。
 */
export function canonicalWorkspace(ctx, raw) {
    const normalized = normalizePath(raw);
    if (normalized === '')
        return '';
    const registry = workspaceRegistry(ctx);
    if (registry === undefined || typeof registry.list !== 'function')
        return normalized;
    try {
        const key = workspaceKey(normalized);
        const found = registry.list().find((workspace) => workspaceKey(workspace.path) === key);
        if (found !== undefined && typeof found.path === 'string')
            return found.path;
    }
    catch {
        /* 未注册的工作区：保留会话自己的路径 */
    }
    return normalized;
}
/** 会话已确定下来的目录，而非它当前的 `cwd`。 */
export function workspaceOfSession(ctx, session) {
    const cwd = session?.header?.cwd;
    if (typeof cwd !== 'string' || cwd === '')
        return '';
    return canonicalWorkspace(ctx, cwd);
}
export function workspaceOfAgent(ctx, agent) {
    if (agent === undefined)
        return '';
    if (agent.session !== undefined)
        return workspaceOfSession(ctx, agent.session);
    return workspaceOfSession(ctx, sessionOf(ctx, agent.id));
}
/**
 * 单个会话实时的沙箱模式，也就是提示词里该陈述的那个值。
 *
 * 策略如果没给出 `mode`，必须返回 null（「unknown」），而不能返回
 * 字符串 "undefined"：`boundaryText` 会把所有无法识别的模式都映射成
 * `workspace-write` 那句话，那样就会把一个错误的写边界
 * 冻进会话的 system prompt。
 */
export function sandboxModeOf(ctx, session) {
    const service = sandboxService(ctx);
    if (service === undefined || typeof service.resolve !== 'function')
        return null;
    try {
        const resolved = service.resolve(session === undefined ? {} : { session });
        if (resolved === null || typeof resolved !== 'object')
            return null;
        const mode = resolved.mode;
        return typeof mode === 'string' && mode !== '' ? mode : null;
    }
    catch {
        return null;
    }
}
export function directoryPickerOf(ctx) {
    const picker = directoryPicker(ctx);
    return picker !== undefined && typeof picker.pick === 'function' ? picker : undefined;
}
/**
 * 面板列出的是 DSH 自己的工作区，而不只是本插件碰巧有的那些分组：
 * 还没有关联项目的工作区同样必须可见，
 * 否则根本没办法配置它。工作区已从注册表消失的分组仍会保留
 * （标记为未注册），这样它的项目就不会丢。
 */
export function workspaceRows(ctx, groups) {
    const rows = [];
    const seen = new Set();
    const registry = workspaceRegistry(ctx);
    if (registry !== undefined && typeof registry.list === 'function') {
        try {
            for (const workspace of registry.list()) {
                if (workspace === null || typeof workspace !== 'object' || typeof workspace.path !== 'string')
                    continue;
                const key = workspaceKey(workspace.path);
                if (key === '')
                    continue;
                seen.add(key);
                const group = groups.find((candidate) => candidate.key === key);
                rows.push({
                    key,
                    path: workspace.path,
                    title: typeof workspace.title === 'string' && workspace.title !== '' ? workspace.title : null,
                    registered: true,
                    projects: group === undefined ? [] : group.projects,
                });
            }
        }
        catch {
            /* 退回到只用分组 */
        }
    }
    for (const group of groups) {
        if (seen.has(group.key))
            continue;
        rows.push({ key: group.key, path: group.path, title: null, registered: false, projects: group.projects });
    }
    return rows;
}
