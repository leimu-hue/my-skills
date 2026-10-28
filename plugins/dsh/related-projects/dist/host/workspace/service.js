import { normalizePath, workspaceKey } from '../shared/paths.js';
export function sessionOf(ctx, id) {
    if (typeof id !== 'string' || id === '')
        return undefined;
    const service = ctx.get('sessions');
    if (service === undefined)
        return undefined;
    try {
        /* 线上传来的是裸字符串；品牌类型只在 Host 内部保证过。 */
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
    const registry = ctx.get('workspaceRegistry');
    if (registry === undefined)
        return normalized;
    try {
        const key = workspaceKey(normalized);
        const found = registry.list().find((workspace) => workspaceKey(workspace.path) === key);
        if (found !== undefined)
            return found.path;
    }
    catch {
        /* 未注册的工作区：保留会话自己的路径 */
    }
    return normalized;
}
/** 会话已确定下来的目录，而非它当前的 `cwd`。 */
export function workspaceOfSession(ctx, session) {
    const cwd = session?.header.cwd;
    if (typeof cwd !== 'string' || cwd === '')
        return '';
    return canonicalWorkspace(ctx, cwd);
}
export function workspaceOfAgent(ctx, agent) {
    if (agent === undefined || agent === null)
        return '';
    return workspaceOfSession(ctx, agent.session);
}
/**
 * 单个会话实时的沙箱模式，也就是提示词里该陈述的那个值。
 *
 * 策略服务不可用或解析失败时必须返回 null（「unknown」），而不能返回
 * 字符串 "undefined"：`boundaryText` 会把所有无法识别的模式都映射成
 * `workspace-write` 那句话，那样就会把一个错误的写边界
 * 冻进会话的 system prompt。
 */
export function sandboxModeOf(ctx, session) {
    const service = ctx.get('sandboxPolicy');
    if (service === undefined)
        return null;
    try {
        const resolved = session === undefined ? service.resolve() : service.resolve({ session });
        return resolved.mode;
    }
    catch {
        return null;
    }
}
/**
 * `ctx.directoryPicker` 暴露的是「交互形态」而不是一个固定的 pick 方法：
 * 只有 `native` 后端才会在宿主显示器上弹出系统目录选择器；`browse` 后端
 * 只提供列目录 / 建目录原语，由界面自己驱动。官方文档给出的默认处理是
 * 「未知形态就隐藏选择能力」，所以这里只把 native 交出去。
 */
export function nativePicker(ctx) {
    const picker = ctx.get('directoryPicker');
    if (picker === undefined)
        return undefined;
    try {
        const capability = picker.capability();
        return capability.kind === 'native' ? capability : undefined;
    }
    catch {
        return undefined;
    }
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
    const registry = ctx.get('workspaceRegistry');
    if (registry !== undefined) {
        try {
            for (const workspace of registry.list()) {
                const key = workspaceKey(workspace.path);
                if (key === '')
                    continue;
                seen.add(key);
                const group = groups.find((candidate) => candidate.key === key);
                rows.push({
                    key,
                    path: workspace.path,
                    title: workspace.title === '' ? null : workspace.title,
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
