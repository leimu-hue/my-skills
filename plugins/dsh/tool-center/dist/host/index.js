/**
 * Host 入口：只做接线。
 *
 * 分层（每层知道的越少越好）：
 *   shared/   路径身份与原子写、请求管道、ZIP、日志、回执与领域异常
 *   skills/   技能域：扫描 → 策略 → 视图 → provider / 文件操作 / op 服务
 *   prompts/  提示词域：AGENTS.md 预设（每份预设自带作用范围）
 *   mcp/      MCP 域：cordis.patch.yml 的服务器行
 *   scenes/   场景域：三域组合的应用与回滚
 *   api/      op 表、agent 工具、那条 HTTP 路由
 */
import { watch } from 'node:fs';
import { migrateLegacyLayout, resolveAgentsHome, resolveDshHome } from './shared/paths.js';
import { createLogger } from './shared/log.js';
import { describe } from './shared/result.js';
import { createScanner } from './skills/scan.js';
import { createService } from './skills/service.js';
import { createHandlers } from './api/routes.js';
import { ROUTE_PATH, createRequestHandler } from './api/server.js';
import { createTools } from './api/tools.js';
export const name = 'tool-center';
/** `skills` 与 `tools` 是必需的，其余缺失只降级（见 `apply`）。 */
export const inject = ['skills', 'tools', 'webServer', 'agents', 'workspaceRegistry'];
export const VERSION = '0.2.0';
export function apply(ctx, config) {
    const dshHome = resolveDshHome(config?.dshHome);
    const builtinDir = typeof config?.builtinSkillDir === 'string' && config.builtinSkillDir !== ''
        ? config.builtinSkillDir
        : process.env.DSH_BUNDLED_SKILL_DIR;
    // 布局迁移必须早于任何读盘：旧版本把数据放在 skill-manager/，现在统一到 tool-center/。
    const migration = migrateLegacyLayout(dshHome);
    const logger = createLogger(dshHome);
    if (migration.moved)
        logger.system(`已把旧数据目录迁移到 ${migration.to}`);
    const service = createService({
        dshHome,
        agentsHome: resolveAgentsHome(),
        claudeHome: typeof config?.claudeHome === 'string' ? config.claudeHome : undefined,
        codexHome: typeof config?.codexHome === 'string' ? config.codexHome : undefined,
        builtinDir,
        scanner: createScanner(),
        log: logger.write,
    });
    registerProviders(ctx, service, logger);
    registerTools(ctx, service, config, logger);
    registerRoute(ctx, service, logger, dshHome);
    registerWatcher(ctx, service, config);
}
/* ------------------------------- provider ------------------------------- */
/**
 * 用一份 provider 注册到给定的 skills 服务上；注册不上就返回 undefined（只降级）。
 *
 * `invalidate()` 是 provider 告诉注册表「我的目录变了」的方式。每次注册都有自己的
 * control，所以每一个都要留住 —— 拆注册时顺手摘掉，避免句柄集合越攒越大。
 */
function registerProviderInto(service, skills) {
    if (skills === undefined || skills === null || typeof skills.registerProvider !== 'function')
        return undefined;
    const provider = service.makeProvider();
    return skills.registerProvider((control) => {
        service.invalidators.add(control.invalidate);
        control.signal?.addEventListener('abort', () => service.invalidators.delete(control.invalidate), { once: true });
        return provider;
    });
}
function skillsOf(value) {
    const candidate = value;
    return candidate !== undefined && candidate !== null && typeof candidate?.registerProvider === 'function'
        ? candidate
        : undefined;
}
function registerProviders(ctx, service, logger) {
    const registerGlobal = () => {
        try {
            const dispose = registerProviderInto(service, skillsOf(ctx.get('skills')));
            if (dispose === undefined) {
                logger.system('skills service unavailable; enable/disable will not reach the model');
                return;
            }
            ctx.effect(() => dispose, 'tool-center: provider');
        }
        catch (error) {
            logger.system(`provider registration failed: ${describe(error)}`);
            ctx.logger?.warn?.(`[tool-center] provider registration failed: ${describe(error)}`);
        }
    };
    // 在 apply 作用域里注册，而不是嵌在另一个 effect 里：disposer 已经由 `registerGlobal`
    // 内部的 `ctx.effect` 持有，把 effect 套进 effect 会让拆卸顺序取决于 cordis 的内部实现。
    registerGlobal();
    ctx.effect(() => () => service.invalidators.clear(), 'tool-center: invalidators');
    /**
     * 技能是按「查看方 agent 的作用域链」解析的，而更近的一层无论 rank 如何都直接压过全局层。
     * 用户级来源是在 agent 自己那层解析的，所以只在全局注册无法遮蔽它们。每次注册都随那个
     * agent 一起拆掉。
     */
    const scoped = new Map();
    const agentIdOf = (agent) => {
        const id = agent?.id;
        return typeof id === 'number' ? id : undefined;
    };
    const installForAgent = (agent) => {
        const id = agentIdOf(agent);
        if (id === undefined || scoped.has(id))
            return;
        const agentCtx = agent.ctx;
        const skills = skillsOf(typeof agentCtx?.get === 'function' ? agentCtx.get('skills') : agentCtx?.skills);
        if (skills === undefined)
            return;
        try {
            const dispose = registerProviderInto(service, skills);
            if (dispose !== undefined)
                scoped.set(id, dispose);
        }
        catch (error) {
            logger.system(`agent-scoped provider registration failed (agent ${id}): ${describe(error)}`);
        }
    };
    const uninstallForAgent = (agent) => {
        const id = agentIdOf(agent);
        if (id === undefined)
            return;
        const dispose = scoped.get(id);
        scoped.delete(id);
        try {
            dispose?.();
        }
        catch {
            /* 已经没了 */
        }
    };
    ctx.effect(() => {
        const offCreated = typeof ctx.on === 'function'
            ? ctx.on('agent/created', ((payload) => installForAgent(payload?.agent)))
            : undefined;
        const offDisposed = typeof ctx.on === 'function'
            ? ctx.on('agent/disposed', ((payload) => uninstallForAgent(payload?.agent)))
            : undefined;
        try {
            const agents = ctx.get('agents');
            if (agents !== undefined && typeof agents.list === 'function') {
                for (const agent of agents.list())
                    installForAgent(agent);
            }
        }
        catch {
            /* 没有活 agent 注册表：光靠事件也够 */
        }
        return () => {
            offCreated?.();
            offDisposed?.();
            for (const dispose of scoped.values()) {
                try {
                    dispose();
                }
                catch {
                    /* 忽略 */
                }
            }
            scoped.clear();
        };
    }, 'tool-center: scoped providers');
}
/* --------------------------------- 工具 --------------------------------- */
function registerTools(ctx, service, config, logger) {
    ctx.effect(() => {
        const tools = ctx.get('tools');
        if (tools === undefined || tools === null || typeof tools.register !== 'function') {
            logger.system('tools service unavailable; skill_list / skill_switch will not be registered');
            return () => undefined;
        }
        const disposers = [];
        for (const tool of createTools(service, { allowAgentSwitch: config?.allowAgentSwitch === true })) {
            try {
                const dispose = tools.register(tool);
                if (typeof dispose === 'function')
                    disposers.push(dispose);
            }
            catch (error) {
                logger.system(`tool registration failed (${tool.name}): ${describe(error)}`);
            }
        }
        return () => {
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch {
                    /* 忽略 */
                }
            }
        };
    }, 'tool-center: tools');
}
/** 宿主的 `connection` 服务（存在时用它做栅栏，否则退回回环地址）。 */
function connectionResolver(ctx) {
    return () => {
        try {
            const value = ctx.get('connection');
            return value !== undefined && value !== null && typeof value === 'object' ? value : undefined;
        }
        catch {
            return undefined;
        }
    };
}
/**
 * 可选的「工作区」作用范围：来自宿主的**工作区登记表**（`ctx.workspaceRegistry`），
 * 不是从会话 cwd 猜的，也不是写死的列表。
 */
function workspaceOptions(ctx) {
    return () => {
        const options = [
            { kind: 'global', label: '全局（所有会话）', path: '' },
        ];
        try {
            const registry = ctx.get('workspaceRegistry');
            const list = registry !== undefined && typeof registry.list === 'function' ? registry.list() : [];
            const seen = new Set();
            for (const workspace of list) {
                const path = workspace?.path;
                const title = workspace?.title;
                if (typeof path !== 'string' || path.trim() === '')
                    continue;
                const resolved = path.trim();
                if (seen.has(resolved))
                    continue;
                seen.add(resolved);
                const label = typeof title === 'string' && title.trim() !== '' ? title.trim() : resolved;
                options.push({ kind: 'workspace', label: `${label}（${resolved}）`, path: resolved });
            }
        }
        catch {
            /* 没有登记表时只剩全局，用户仍可手填路径 */
        }
        return options;
    };
}
function registerRoute(ctx, service, logger, dshHome) {
    ctx.effect(() => {
        const webServer = ctx.get('webServer');
        if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') {
            logger.system('webServer service unavailable; the settings panel has no data source');
            return () => undefined;
        }
        const handlers = createHandlers(service, {
            version: VERSION,
            providerName: service.providerName,
            dshHome,
            listWorkspaces: workspaceOptions(ctx),
        });
        const handler = createRequestHandler({ handlers, logger, connection: connectionResolver(ctx) });
        const dispose = webServer.register({ kind: 'exact', path: ROUTE_PATH, handler });
        return () => {
            try {
                dispose();
            }
            catch {
                /* 忽略 */
            }
        };
    }, 'tool-center: route');
}
/* ------------------------------- 监听器 ------------------------------- */
function registerWatcher(ctx, service, config) {
    ctx.effect(() => {
        if (config?.watch === false)
            return () => undefined;
        const watchers = [];
        let timer = null;
        const refresh = () => {
            if (timer !== null)
                return;
            timer = setTimeout(() => {
                timer = null;
                service.touch();
            }, 250);
            timer.unref?.();
        };
        const attach = (roots) => {
            for (const root of roots) {
                try {
                    const watcher = watch(root.path, { persistent: false }, () => refresh());
                    watcher.on('error', () => { });
                    watchers.push(watcher);
                }
                catch {
                    /* 来源目录还不存在：靠解析缓存的 mtime 校验兜住 */
                }
            }
        };
        void service.roots(process.cwd()).then((roots) => attach(roots)).catch(() => undefined);
        return () => {
            if (timer !== null)
                clearTimeout(timer);
            for (const watcher of watchers) {
                try {
                    watcher.close();
                }
                catch {
                    /* 忽略 */
                }
            }
            watchers.length = 0;
        };
    }, 'tool-center: watcher');
}
