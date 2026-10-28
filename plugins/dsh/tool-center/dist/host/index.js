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
import { createSceneCommand } from './commands/scene.js';
import { createSceneGate } from './scenes/gate.js';
import { reconcileSessionLayers } from './scenes/service.js';
import { workspaceOfAgent, rootSessionIdOf } from './scope/agent-scope.js';
export const name = 'tool-center';
/** `skills` 与 `tools` 是必需的，其余缺失只降级（见 `apply`）。 */
export const inject = ['skills', 'tools', 'webServer', 'agents', 'workspaceRegistry'];
const VERSION = '0.4.3';
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
        hostCandidates: () => readHostCandidates(ctx),
        scanner: createScanner(),
        log: logger.write,
    });
    registerProviders(ctx, service, logger);
    registerSkillsEvents(ctx, service);
    registerTools(ctx, service, config, logger);
    const gate = registerSceneToolGate(ctx, dshHome, logger);
    registerSceneCommand(ctx, service, dshHome, logger, gate.refresh);
    registerRoute(ctx, service, logger, dshHome, gate.refresh);
    registerWatcher(ctx, service, config);
    // 启动时按当前文档重新物化会话层：层是快照，场景定义或工作区映射可能在上次退出后变过。
    ctx.effect(() => {
        void reconcileSessionLayers(dshHome, service).catch((error) => {
            logger.system(`scene reconcile failed: ${describe(error)}`);
        });
        return () => undefined;
    }, 'tool-center: scene reconcile');
}
/* ------------------------------- provider ------------------------------- */
/**
 * 用一份 provider 注册到给定的 skills 服务上；注册不上就返回 undefined（只降级）。
 *
 * `invalidate()` 是 provider 告诉注册表「我的目录变了」的方式。每次注册都有自己的
 * control，所以每一个都要留住 —— 拆注册时顺手摘掉，避免句柄集合越攒越大。
 */
function registerProviderInto(service, skills, scopeKey) {
    if (skills === undefined || skills === null || typeof skills.registerProvider !== 'function')
        return undefined;
    const provider = service.makeProvider(scopeKey);
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
/**
 * 「宿主到底认为有哪些技能」的读取器。
 *
 * 核验必须问宿主的合并目录，而不是我们自己的视图：我们的视图只说明「打算让宿主看到什么」。
 * 没有 `snapshot` 能力的宿主（或服务未装载）返回 undefined，由 op 层报「无法核验」。
 */
function snapshotSkillsReader(ctx) {
    return async (options) => {
        const skills = skillsOf(ctx.get('skills'));
        if (skills === undefined || typeof skills.snapshot !== 'function')
            return undefined;
        try {
            const snapshot = await skills.snapshot({ cwd: options.cwd, scope: options.scope });
            return snapshot.skills.map((skill) => ({
                name: skill.name,
                provider: skill.provider,
                invocation: skill.invocation,
            }));
        }
        catch (error) {
            ctx.logger?.warn?.(`[tool-center] snapshot failed: ${describe(error)}`);
            return undefined;
        }
    };
}
/**
 * 从一个（可能是作用域的）context 上取 skills 服务。
 *
 * 优先 `get('skills')`（作用域 context 会把服务绑到自己的层），其次属性访问；
 * 两者都可能因「provider 不在注入链里」而抛错 —— 那种情况返回 undefined，由调用方决定
 * 降级，而不是让一个 agent 的注册失败掀掉整个事件分发。
 */
function scopedSkillsOf(context) {
    const candidate = context;
    try {
        if (typeof candidate?.get === 'function') {
            const viaGet = skillsOf(candidate.get('skills'));
            if (viaGet !== undefined)
                return viaGet;
        }
        return skillsOf(candidate?.skills);
    }
    catch {
        return undefined;
    }
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
    /**
     * 当前 DSH 的 `Agent.id` 是 `SessionId`（字符串 UUID），不是数字 —— 早先只认数字，
     * 于是每个 agent 都在这一行被跳过，作用域 provider 一个都没注册上：覆盖候选只剩全局
     * 那一份，遇到宿主在 agent / preset 层发布的同名技能就会被层级直接压过，rank 再低
     * 也没用（office 关不掉就是这个）。
     */
    const agentIdOf = (agent) => {
        const id = agent?.id;
        if (typeof id === 'string' && id !== '')
            return id;
        return typeof id === 'number' ? id : undefined;
    };
    const installForAgent = (agent) => {
        const id = agentIdOf(agent);
        if (id === undefined || scoped.has(id))
            return;
        const agentCtx = agent?.ctx;
        const skills = scopedSkillsOf(agentCtx);
        if (skills === undefined) {
            // 作用域服务取不到就只剩全局覆盖（遇到更近层会失效）。记一行，别静默降级。
            logger.system(`agent ${id}: skills service is not reachable from the agent scope; scoped overlay skipped`);
            return;
        }
        try {
            // 会话级场景：这个 agent 的 provider 按**根会话**的作用域解析，会话层才压得过工作区层。
            const sessionId = rootSessionIdOf(agent);
            const dispose = registerProviderInto(service, skills, sessionId === null ? undefined : `ss:${sessionId}`);
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
/* ------------------------------ 技能变更事件 ------------------------------ */
/**
 * 订阅宿主的 `skills/change`：注册表（provider 注册 / 失效、文件监听）变了才重探一次
 * 「宿主发布的目录」，而不是每次面板读取都跑一遍 `ctx.skills.list()`。
 *
 * 这就是「进入技能页卡一下」的来源：以前 `state` 读视图时会顺带等一次 list()，而宿主
 * 的 list() 要把所有 provider 都问一遍。现在读路径只碰缓存，缓存由事件维护。
 *
 * 同一次变更还要**通知浏览器**：DSH 的 `/` 技能菜单有自己的 session 级缓存（见
 * `notifySkillMenus`），不戳它一下，面板里刚打开的技能在 `/` 里仍然搜不到。
 *
 * 防抖 250ms：一次写操作会连续失效多个 provider，没必要每个都探一遍。启动的那次用
 * 0ms 推迟一拍，等各插件把自己的 provider 都注册好。
 */
function registerSkillsEvents(ctx, service) {
    ctx.effect(() => {
        let timer = null;
        let pendingNotify = false;
        const disposers = [];
        const probeSoon = (delay, notify) => {
            pendingNotify = pendingNotify || notify;
            if (timer !== null)
                return;
            timer = setTimeout(() => {
                timer = null;
                const shouldNotify = pendingNotify;
                pendingNotify = false;
                if (shouldNotify)
                    notifySkillMenus(ctx);
                void service.refreshHostDirs();
            }, delay);
            timer.unref?.();
        };
        if (typeof ctx.on === 'function') {
            const dispose = ctx.on('skills/change', (() => probeSoon(250, true)));
            if (typeof dispose === 'function')
                disposers.push(dispose);
        }
        // 启动先探一次：面板第一次打开就能直接命中缓存（这一次不在读路径上，也不必通知界面）。
        probeSoon(0, false);
        return () => {
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch {
                    /* 忽略 */
                }
            }
            if (timer !== null)
                clearTimeout(timer);
        };
    }, 'tool-center: skills change');
}
/**
 * 让 DSH 的 `/` 技能菜单重新拉一次 `remote.skills.list()`。
 *
 * 为什么需要：`@deepseek-ai/dsh-client-ui-skill` 按 session 缓存技能列表，只在这两个
 * 事件上失效 —— `agent-preset/selected`（远端事件，第一个参数是 sessionId）与
 * `connection/reset`（浏览器本地事件）。这一版的 remote 转发白名单
 * （`@deepseek-ai/dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS`）里**没有**
 * `skills/change`，插件也没有别的公共接口能清那份缓存。
 *
 * 所以技能策略变化后按 session 补发一次 `agent-preset/selected`。它只有两个消费方：
 * `ui-skill` 清该 session 的技能缓存、`ui-commands` 重置该 session 的命令目录；
 * 宿主侧没有任何监听，不会改会话里的 preset，也不会写会话日志。等 DSH 将来把
 * `skills/change` 转发到浏览器，这段就可以删掉。
 */
function notifySkillMenus(ctx) {
    try {
        if (typeof ctx.emit !== 'function')
            return;
        const sessions = ctx.get('sessions');
        if (typeof sessions?.list !== 'function')
            return;
        for (const session of sessions.list()) {
            const id = session?.id;
            if (typeof id !== 'string' || id === '')
                continue;
            const preset = session?.header?.agentPreset;
            ctx.emit('agent-preset/selected', id, typeof preset === 'string' ? preset : '');
        }
    }
    catch {
        // 只是让界面刷新：失败不能影响技能策略本身。
    }
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
/** agent 所在的工作区：从会话身份解析（子会话上溯到根会话，见 scope/agent-scope.ts）。 */
/** agent 作用域里的 tools 服务（`agent.ctx.get('tools')`）。 */
function scopedToolsOf(agent) {
    const agentCtx = agent?.ctx;
    if (agentCtx === undefined || typeof agentCtx.get !== 'function')
        return undefined;
    try {
        const tools = agentCtx.get('tools');
        return tools !== undefined && tools !== null && typeof tools.restrict === 'function' ? tools : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 把「工作区场景」落到工具层：在 agent 作用域里遮蔽不属于该场景的 MCP 工具。
 *
 * 返回一个 `refresh()`：场景被写入 / 退出之后调用它，正在跑的会话下一轮就能看到新目录
 * （工具目录按步组装，所以不需要重开会话）。服务缺失时它是空操作 —— 插件其余部分照常。
 */
function registerSceneToolGate(ctx, dshHome, logger) {
    const handle = { refresh: () => { } };
    ctx.effect(() => {
        let tools;
        try {
            const value = ctx.get('tools');
            tools = value !== undefined && value !== null && typeof value.schemas === 'function' ? value : undefined;
        }
        catch {
            tools = undefined;
        }
        if (tools === undefined) {
            logger.system('tools service has no schemas(); MCP tools cannot be gated per workspace');
            return () => undefined;
        }
        const gate = createSceneGate({
            dshHome,
            globalToolNames: () => {
                try {
                    return (tools?.schemas?.() ?? []).map((schema) => schema.name);
                }
                catch {
                    return [];
                }
            },
            toolsScopeOf: scopedToolsOf,
            cwdOf: workspaceOfAgent,
            sessionIdOf: rootSessionIdOf,
            liveAgents: () => {
                try {
                    const agents = ctx.get('agents');
                    const list = typeof agents?.list === 'function' ? [...agents.list()] : [];
                    // 先把每个会话的 cwd 记一遍：子会话要沿 parentSession 上溯到根会话，
                    // 而父会话可能排在列表后面（顺序不由我们决定）。
                    for (const agent of list)
                        workspaceOfAgent(agent);
                    return list;
                }
                catch {
                    return [];
                }
            },
            log: (event, detail) => logger.system(`${event}: ${detail}`),
        });
        handle.refresh = () => { void gate.refresh(); };
        const disposers = [];
        let timer = null;
        if (typeof ctx.on === 'function') {
            disposers.push(ctx.on('agent/created', ((payload) => {
                void gate.install(payload?.agent);
            })));
            disposers.push(ctx.on('agent/disposed', ((payload) => {
                gate.uninstall(payload?.agent);
            })));
            // 工具集合变化（MCP 服务器连上 / 掉线 / 启停）就重算。我们自己的 restrict 也会触发
            // 这个事件，靠 gate 内部「名单没变就不重挂」收敛。
            disposers.push(ctx.on('tools/change', (() => {
                if (timer !== null)
                    return;
                timer = setTimeout(() => {
                    timer = null;
                    void gate.refresh();
                }, 150);
                timer.unref?.();
            })));
        }
        // 启动时先给已经活着的 agent 装上。
        void gate.refresh();
        return () => {
            if (timer !== null)
                clearTimeout(timer);
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch {
                    /* 忽略 */
                }
            }
            gate.uninstallAll();
            handle.refresh = () => { };
        };
    }, 'tool-center: scene tool gate');
    return handle;
}
/**
 * 注册 `/scene`。
 *
 * 命令服务不在注入链里时不报错、只降级：装了这个插件的宿主几乎都带 `dsh-commands`，
 * 但没有它的宿主（UI-less 组合）不该因此整个插件都装不上。
 *
 * 有 `ctx.inject` 时走它：命令服务可能比本插件晚装载，直接 `get` 会拿到空值，命令就
 * 静默消失了。没有 `inject` 的宿主退回「立刻试一次」。
 */
function registerSceneCommand(ctx, service, dshHome, logger, scenesChanged) {
    const mount = (scoped) => {
        let commands;
        try {
            const value = scoped.get('commands');
            commands = value !== undefined && value !== null && typeof value.register === 'function' ? value : undefined;
        }
        catch {
            commands = undefined;
        }
        if (commands === undefined) {
            logger.system('commands service unavailable; /scene will not be registered');
            return;
        }
        try {
            const dispose = commands.register(createSceneCommand({ dshHome, service, scenesChanged }));
            scoped.effect(() => () => {
                try {
                    dispose?.();
                }
                catch {
                    /* 已经没了 */
                }
            }, 'tool-center: scene command');
        }
        catch (error) {
            logger.system(`command registration failed (/scene): ${describe(error)}`);
        }
    };
    if (typeof ctx.inject === 'function')
        ctx.inject(['commands'], mount);
    else
        mount(ctx);
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
/**
 * 按会话 id 反查工作区（会话头里的 `cwd`）。
 *
 * 「新会话页」的选择器只拿得到 sessionId，工作区在服务端解析：客户端拿不到 cwd，
 * 也不该猜一个 —— 猜错就是把会话挂到别的工作区上。
 */
function sessionCwdOf(ctx) {
    return (sessionId) => {
        if (sessionId === '')
            return null;
        try {
            const sessions = ctx.get('sessions');
            if (sessions === undefined)
                return null;
            const session = typeof sessions.get === 'function'
                ? sessions.get(sessionId)
                : [...(sessions.list?.() ?? [])].find((item) => item?.id === sessionId);
            const cwd = session;
            const value = cwd?.header?.cwd ?? cwd?.meta?.cwd;
            return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
        }
        catch {
            return null;
        }
    };
}
function registerRoute(ctx, service, logger, dshHome, scenesChanged) {
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
            snapshotSkills: snapshotSkillsReader(ctx),
            scenesChanged,
            sessionCwd: sessionCwdOf(ctx),
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
/**
 * 读宿主技能注册表：把各 provider 发布的候选摊平成「名字 + 定位路径」。
 *
 * 只用来**反推来源目录**（见 `HostCandidate`）。注意 `ctx.skills.list()` 返回的是
 * `toSummary()` 的摘要：**没有 `locator`、也没有 `path`**，稳定存在的只有
 * `resourceBase.path`（技能自己的资源目录）。所以这里两个都读，交给 service 判断
 * 哪个能反推出集合目录。读不到就返回空数组。
 */
async function readHostCandidates(ctx) {
    try {
        const skills = ctx.get('skills');
        if (skills === undefined || skills === null)
            return [];
        const listed = typeof skills.list === 'function' ? await skills.list() : await skills.snapshot?.();
        const items = Array.isArray(listed) ? listed : [];
        const out = [];
        for (const item of items) {
            const candidate = item;
            if (candidate === null || typeof candidate !== 'object')
                continue;
            const docPath = typeof candidate.locator?.path === 'string'
                ? candidate.locator.path
                : typeof candidate.path === 'string' ? candidate.path : '';
            const skillDir = typeof candidate.resourceBase?.path === 'string' ? candidate.resourceBase.path : '';
            if (docPath === '' && skillDir === '')
                continue;
            out.push({
                name: typeof candidate.name === 'string' ? candidate.name : '',
                ...(docPath === '' ? {} : { docPath }),
                ...(skillDir === '' ? {} : { skillDir }),
            });
        }
        return out;
    }
    catch (error) {
        loggerWarn(ctx, `could not read the host skill registry: ${describe(error)}`);
        return [];
    }
}
function loggerWarn(ctx, message) {
    try {
        ctx.logger?.warn?.(`[tool-center] ${message}`);
    }
    catch {
        /* 忽略 */
    }
}
