/**
 * worktree 生命周期服务：检测 → 创建 → 观察 → 预览 → 应用 → 删除。
 *
 * 三条规则：
 *
 *   1. **先检测再创建**。会话目录已经在 linked worktree 里时不再创建第二个；
 *      submodule 里 `GIT_DIR != GIT_COMMON` 同样成立，但那是普通检出，必须放行。
 *   2. **Git 是事实来源**。列表以 `git worktree list --porcelain` 为准，注册表
 *      只补「谁建的、基线是什么」。外部创建的检出以只读身份出现，插件不删它。
 *   3. **创建方式决定落地路径**。分支模式在检出里 commit / PR；detached 模式靠
 *      `apply` 把净改动搬回主仓工作区。
 *
 * 可变状态只有注册表、设置与进程内选择；Git 状态每次现读并做 4 秒短缓存，
 * 变更按仓库 / worktree id 串行。
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DomainError, describe } from "../shared/errors.js";
import { userTextMessage } from "../shared/messages.js";
import { WorktreeSettingsStore } from "./settings.js";
import { branchNameFor, externalId, isInside, samePath, validateName, worktreePath, worktreesRoot, } from "../shared/paths.js";
import { runCommand } from "../shared/exec.js";
import { Git, asOid } from "../git/commands.js";
import { gitOid, runGit } from "../git/exec.js";
import { copyWorktreeIncludes } from "../git/include.js";
import { inspectRepository } from "../git/repository.js";
import { applyCheckout, archiveCheckout, createCheckout, ensureIgnored, inspectRemoval, listCheckouts, lockCheckout, readDiff, readStatus, removeCheckout, unlockCheckout, } from "../git/worktree.js";
import { WorktreeRegistry } from "./registry.js";
const STATUS_TTL_MS = 4_000;
function noIsolation(cwd) {
    return { cwd, inWorktree: false, inSubmodule: false, path: null, branch: null, mainRoot: null };
}
function describeIsolation(info, cwd) {
    if (info === null)
        return noIsolation(cwd);
    return {
        cwd,
        inWorktree: info.isWorktree,
        inSubmodule: info.isSubmodule,
        path: info.root,
        branch: info.branch,
        mainRoot: info.mainRoot,
    };
}
export class WorktreeService {
    ctx;
    options;
    registry;
    settings;
    selected = null;
    statuses = new Map();
    locks = new Map();
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.registry = new WorktreeRegistry(`${options.stateDir}/worktrees.json`);
        this.settings = new WorktreeSettingsStore(`${options.stateDir}/settings.json`);
    }
    /** 普通 git 命令的超时；命令与工具共用同一个值。 */
    get gitTimeout() {
        return this.options.gitTimeoutMs;
    }
    get layout() {
        return this.options.layout;
    }
    /** 当前的分支前缀；面板读它，命令与工具用它拼分支名。 */
    get branchPrefix() {
        return this.settings.read().branchPrefix;
    }
    /** 串行化同一仓库（或同一 worktree）上的变更。 */
    withLock(key, task) {
        const previous = this.locks.get(key) ?? Promise.resolve();
        const next = previous.then(task, task);
        this.locks.set(key, next.catch(() => undefined));
        return next;
    }
    invalidate(path) {
        if (path === undefined)
            this.statuses.clear();
        else
            this.statuses.delete(pathKey(path));
    }
    /* ------------------------------- 读取 ------------------------------- */
    /**
     * 「当前仓库」的推断顺序：面板里显式选过的 → 最近活跃会话的目录 → 注册表里的
     * 第一个仓库。探测失败就继续找下一个，全部失败时返回「没有仓库」。
     *
     * `cwd` 单独记着会话目录：隔离探测说的始终是「这个会话在哪」，不是「面板在看哪个仓库」。
     */
    async probe() {
        const session = this.options.recentWorkspace?.() ?? null;
        const candidates = [];
        if (this.selected !== null)
            candidates.push(this.selected);
        if (session !== null && session !== '')
            candidates.push(session);
        const first = this.registry.list()[0];
        if (first !== undefined)
            candidates.push(first.repository);
        for (const candidate of candidates) {
            try {
                return { info: await inspectRepository(candidate, { timeoutMs: this.options.gitTimeoutMs }), cwd: session ?? this.selected };
            }
            catch {
                /* 不是仓库 / 目录已消失：继续找下一个候选。 */
            }
        }
        return { info: null, cwd: session ?? this.selected };
    }
    async currentRepositoryInfo(fresh = false) {
        const probe = await this.probe();
        if (probe.info === null)
            return null;
        if (!fresh)
            return probe.info;
        return inspectRepository(probe.info.root, { timeoutMs: this.options.gitTimeoutMs, fresh: true });
    }
    static async isolationOf(probe, timeoutMs) {
        if (probe.cwd === null || probe.cwd === '')
            return describeIsolation(probe.info, probe.cwd);
        /* 面板可能被切到另一个仓库；隔离探测只认会话自己的目录。 */
        if (probe.info === null || !samePath(probe.info.root, probe.cwd)) {
            try {
                return describeIsolation(await inspectRepository(probe.cwd, { timeoutMs }), probe.cwd);
            }
            catch {
                /* 会话目录已经不是仓库了：退回已探测到的那个。 */
            }
        }
        return describeIsolation(probe.info, probe.cwd);
    }
    /**
     * 面板里的「工作区」列表：DSH 工作区 + 本插件登记过的仓库 + 当前推断仓库。
     *
     * 工作区才是用户认知的单位；仓库只是它恰好是个 Git 仓库时的投影。非 Git 的
     * 工作区探测失败就跳过，不把它们混进「可选仓库」里。
     */
    async knownRepositories() {
        const candidates = new Set();
        const workspaces = this.ctx.get('workspaceRegistry');
        for (const workspace of workspaces?.list() ?? [])
            candidates.add(workspace.path);
        for (const record of this.registry.list())
            candidates.add(record.repository);
        const probe = await this.probe();
        if (probe.info !== null)
            candidates.add(probe.info.root);
        const rows = [];
        const seen = new Set();
        for (const candidate of candidates) {
            try {
                const info = await inspectRepository(candidate, { timeoutMs: this.options.gitTimeoutMs });
                const key = pathKey(info.mainRoot);
                if (seen.has(key))
                    continue;
                seen.add(key);
                rows.push(info);
            }
            catch {
                /* 不是仓库 / 目录已消失：跳过。 */
            }
        }
        return rows;
    }
    async repositoryRows() {
        const counts = new Map();
        for (const record of this.registry.list()) {
            const key = pathKey(record.repository);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const rows = new Map();
        const add = (info) => {
            const key = pathKey(info.mainRoot);
            rows.set(key, { root: info.mainRoot, name: info.name, worktrees: counts.get(key) ?? 0 });
        };
        /* 面板只能选 DSH 工作区：仓库是「工作区恰好落在 Git 仓库上」时的投影。 */
        const workspaces = this.ctx.get('workspaceRegistry');
        if (workspaces !== undefined) {
            for (const workspace of workspaces.list()) {
                try {
                    add(await inspectRepository(workspace.path, { timeoutMs: this.options.gitTimeoutMs }));
                }
                catch {
                    /* 不是 Git 仓库的工作区：跳过。 */
                }
            }
        }
        else {
            /* 没有工作区注册表（UI-less / 测试）：退回登记过的仓库，面板仍可用。 */
            for (const info of await this.knownRepositories())
                add(info);
        }
        return [...rows.values()].sort((left, right) => left.name.localeCompare(right.name));
    }
    async state() {
        const probe = await this.probe();
        const repository = probe.info === null ? null : toRepositoryView(probe.info);
        return {
            repository,
            repositories: await this.repositoryRows(),
            worktrees: probe.info === null ? [] : await this.listViews(probe.info),
            isolation: await WorktreeService.isolationOf(probe, this.options.gitTimeoutMs),
            layout: this.options.layout,
            branchPrefix: this.branchPrefix,
        };
    }
    /** 某个仓库下的全部检出（managed + external）；工具、命令与面板共用。 */
    async listFor(repository) {
        return this.listViews(await inspectRepository(repository, { timeoutMs: this.options.gitTimeoutMs }));
    }
    async listViews(info) {
        const repository = info.mainRoot;
        const records = this.registry.list(repository);
        let checkouts = [];
        try {
            checkouts = await listCheckouts(repository, this.options.gitTimeoutMs);
        }
        catch {
            /* Git 读不到就只显示注册表里的记录，不把整个面板变成错误页。 */
        }
        const others = checkouts.filter((checkout) => !samePath(checkout.path, repository) && checkout.bare !== true);
        const pending = new Map();
        for (const checkout of others)
            pending.set(pathKey(checkout.path), checkout);
        const views = [];
        for (const record of records) {
            const key = pathKey(record.path);
            const checkout = pending.get(key) ?? null;
            if (checkout !== null)
                pending.delete(key);
            views.push(await this.buildView(info, record, checkout));
        }
        for (const checkout of pending.values()) {
            views.push(await this.buildView(info, null, checkout));
        }
        return views.sort((left, right) => {
            if (left.current !== right.current)
                return left.current ? -1 : 1;
            if (left.origin !== right.origin)
                return left.origin === 'managed' ? -1 : 1;
            return (right.createdAt ?? 0) - (left.createdAt ?? 0) || left.name.localeCompare(right.name);
        });
    }
    async buildView(info, record, checkout) {
        const path = record?.path ?? checkout?.path ?? '';
        const missing = path === '' || !existsSync(path);
        const mode = record?.mode ?? null;
        const branch = checkout?.branch ?? (checkout?.detached === true ? null : record?.branch ?? null);
        /*
         * 基线只认真正的提交 id。历史版本把分支名（`master`）写进过 baseOid，
         * 那样的记录不是「基线」，是「未知」——用 HEAD 当参照系，别拿它去算补丁。
         */
        const recorded = asOid(record?.baseOid);
        const baseOid = recorded ?? info.headOid;
        const status = missing || baseOid === null
            ? { dirty: 0, files: 0, ahead: 0, behind: 0 }
            : await this.statusOf(path, baseOid);
        return {
            id: record?.id ?? externalId(path),
            name: record?.name ?? basenameOf(path),
            origin: record === null ? 'external' : 'managed',
            repository: info.mainRoot,
            repositoryName: info.name,
            path,
            branch,
            headOid: checkout?.headOid ?? null,
            mode,
            baseOid: recorded,
            baseBranch: record?.baseBranch ?? null,
            createdAt: record?.createdAt ?? null,
            state: missing ? 'missing' : 'ready',
            locked: checkout?.locked ?? false,
            prunable: checkout?.prunable ?? false,
            dirty: status.dirty,
            files: status.files,
            ahead: status.ahead,
            behind: status.behind,
            workspaceId: record?.workspaceId ?? null,
            current: info.isWorktree && !info.isSubmodule && samePath(info.root, path),
        };
    }
    async statusOf(path, baseOid) {
        const key = pathKey(path);
        const cached = this.statuses.get(key);
        if (cached !== undefined && Date.now() - cached.at < STATUS_TTL_MS)
            return cached.value;
        try {
            const value = await readStatus(path, baseOid, this.options.gitTimeoutMs);
            this.statuses.set(key, { at: Date.now(), value });
            return value;
        }
        catch {
            /* 读不到状态不等于目录不存在：数字归零，state 仍是 ready。 */
            return { dirty: 0, files: 0, ahead: 0, behind: 0 };
        }
    }
    async view(id, fresh = true) {
        const record = this.recordOf(id);
        if (fresh)
            this.invalidate(record.path);
        const info = await inspectRepository(record.repository, { timeoutMs: this.options.gitTimeoutMs, fresh: true });
        const views = await this.listViews(info);
        const found = views.find((view) => view.id === id);
        if (found === undefined)
            throw new DomainError('unknown-worktree');
        return found;
    }
    /** 按名字查记录（命令与工具里用；UI 用 id）。 */
    findByName(repository, name) {
        return this.registry.findByName(repository, name);
    }
    /**
     * 按名字**或** id 找记录，且必须属于这个仓库。
     *
     * `worktree_list` 同时给出 name 与 id，`worktree_diff` 只收一个参数；不把两者
     * 都认下的话，列表里看得见的条目在 diff 里会变成 `unknown-worktree`。
     */
    findIn(repository, key) {
        const byName = this.registry.findByName(repository, key);
        if (byName !== undefined)
            return byName;
        const byId = this.registry.find(key);
        return byId !== undefined && samePath(byId.repository, repository) ? byId : undefined;
    }
    recordOf(id) {
        const record = this.registry.find(id);
        if (record === undefined)
            throw new DomainError(id.startsWith('external:') ? 'worktree-external' : 'unknown-worktree');
        return record;
    }
    /** 记录存在且目录仍在。删除是唯一允许目录缺失的操作，所以它不走这里。 */
    existingRecord(id) {
        const record = this.recordOf(id);
        if (!existsSync(record.path))
            throw new DomainError('worktree-missing');
        return record;
    }
    async diff(id) {
        const record = this.existingRecord(id);
        return readDiff(record.path, asOid(record.baseOid), this.options.gitTimeoutMs);
    }
    /**
     * 记录里的基线。注册表是磁盘上的 JSON，可能被旧版本写坏，或者是人手改的；
     * 不是提交 id 就拒绝用它做补丁（否则会把一个分支名当基线，反向撤销别人的提交）。
     */
    baselineOf(record) {
        const oid = asOid(record.baseOid);
        if (oid === null) {
            throw new DomainError('git-failed', `登记里的基线不是提交 id（${JSON.stringify(record.baseOid)}）：删掉这个检出重建一个，或手动合并分支`);
        }
        return oid;
    }
    /* ------------------------------- 变更 ------------------------------- */
    /**
     * 把一个 DSH 工作区目录设为面板的当前仓库。
     *
     * 选中的是 worktree 目录时归位到主仓：worktree 归属仓库，不归属自己。
     */
    async select(repository) {
        if (typeof repository !== 'string' || repository.trim() === '')
            throw new DomainError('bad-request');
        const workspaces = this.ctx.get('workspaceRegistry');
        /* 只允许选 DSH 工作区：面板不提供任意目录入口，Host 也不接受绕过的请求。 */
        if (workspaces !== undefined && !workspaces.list().some((workspace) => samePath(workspace.path, repository))) {
            throw new DomainError('not-a-workspace');
        }
        const info = await inspectRepository(repository, { timeoutMs: this.options.gitTimeoutMs, fresh: true });
        this.selected = info.mainRoot;
        return this.state();
    }
    async create(input) {
        const requested = typeof input.repository === 'string' && input.repository !== '' ? input.repository : undefined;
        const source = requested !== undefined
            ? await inspectRepository(requested, { timeoutMs: this.options.gitTimeoutMs, fresh: true })
            : await this.currentRepositoryInfo();
        if (source === null)
            throw new DomainError('not-a-repository');
        /* 先检测：已经在隔离里就不再创建第二个。 */
        if (source.isWorktree && !source.isSubmodule) {
            const views = await this.listViews(source);
            const existing = views.find((view) => samePath(view.path, source.root)) ?? null;
            return {
                created: false,
                reason: 'already-isolated',
                worktree: existing,
                copied: [],
                ignoreAdded: false,
                commands: [],
                workspaceId: null,
                sessionId: null,
            };
        }
        /* submodule 是普通检出：可以建 worktree，但归属仍是它自己。 */
        const repository = samePath(source.mainRoot, source.root)
            ? source
            : await inspectRepository(source.mainRoot, { timeoutMs: this.options.gitTimeoutMs, fresh: true });
        const name = validateName(input.name);
        if (this.registry.findByName(repository.root, name) !== undefined)
            throw new DomainError('duplicate-worktree');
        const mode = input.mode === 'detached' || input.mode === 'branch' ? input.mode : this.options.mode;
        const branch = mode === 'branch' ? await this.branchFor(repository, input.branch, name) : null;
        const base = await this.resolveBase(repository, input.base);
        const target = worktreePath(this.options.stateDir, repository.root, this.options.layout, this.options.worktreeDir, name);
        const root = dirname(target);
        if (!isInside(worktreesRoot(this.options.stateDir, repository.root, this.options.layout, this.options.worktreeDir), target)) {
            throw new DomainError('invalid-name');
        }
        let ignoreAdded = false;
        /* 锁按**仓库**取：创建、应用、删除都在同一个主仓上，不能各锁各的。 */
        const created = await this.withLock(pathKey(repository.root), async () => {
            if (this.options.layout === 'repo') {
                /* 目录必须被忽略，否则主仓会立刻变脏。写 .git/info/exclude，不动历史。 */
                const ignored = await ensureIgnored({
                    repository: repository.root,
                    commonDir: repository.commonDir,
                    relative: this.options.worktreeDir,
                    timeoutMs: this.options.gitTimeoutMs,
                });
                ignoreAdded = ignored.added;
            }
            await createCheckout({
                repository: repository.root,
                root,
                target,
                baseOid: base.oid,
                mode,
                branch,
                reason: `dsh-worktree:${name}`,
                timeoutMs: this.options.worktreeAddTimeoutMs,
            });
            const record = {
                id: randomUUID(),
                name,
                repository: repository.root,
                repositoryName: repository.name,
                path: target,
                baseOid: base.oid,
                baseBranch: base.ref,
                mode,
                branch,
                createdAt: Date.now(),
                workspaceId: null,
            };
            /*
             * 登记失败就把检出收回：否则磁盘上多一个「Git 知道、插件不知道」的检出，
             * 它在面板里以 external 出现，而插件从不删 external——永久占着名字。
             */
            try {
                this.registry.add(record);
            }
            catch (error) {
                await removeCheckout(repository.root, target, this.options.worktreeAddTimeoutMs).catch(() => undefined);
                throw new DomainError('git-failed', `could not record the worktree: ${describe(error)}`);
            }
            this.invalidate();
            return record;
        });
        /* include / setup 失败都不撤掉已建好的 worktree：只把原因带回去。 */
        let copied = [];
        let includeError;
        try {
            copied = (await copyWorktreeIncludes(repository.root, target, this.options.gitTimeoutMs)).copied;
        }
        catch (error) {
            includeError = describe(error);
        }
        const commands = await this.runConfigured(target);
        /* 创建完成后把它变成「可以直接干活」的地方：工作区 + 会话（+ 任务）。 */
        const task = typeof input.task === 'string' && input.task.trim() !== '' ? input.task.trim() : undefined;
        const activation = await this.activate(created, task);
        const info = await inspectRepository(repository.root, { timeoutMs: this.options.gitTimeoutMs, fresh: true });
        const views = await this.listViews(info);
        return {
            created: true,
            worktree: views.find((view) => view.id === created.id) ?? null,
            copied,
            ignoreAdded,
            commands,
            ...activation,
            ...(includeError === undefined ? {} : { includeError }),
        };
    }
    /**
     * 创建后的两步激活：注册工作区（侧栏可见）+ 在检出里新建会话，并把任务发进它的第一轮。
     *
     * 全部是「锦上添花」：失败只记录原因，绝不撤销已经建好的检出。
     */
    async activate(record, task) {
        let workspaceId = null;
        let sessionId = null;
        let sessionError;
        let taskError;
        if (this.options.autoRegisterWorkspace) {
            try {
                workspaceId = (await this.registerWorkspace(record.id)).workspaceId;
            }
            catch (error) {
                sessionError = describe(error);
            }
        }
        if (this.options.autoSession) {
            try {
                const started = await this.startSession(record, task);
                sessionId = started.sessionId;
                taskError = started.taskError;
            }
            catch (error) {
                sessionError = describe(error);
            }
        }
        else if (task !== undefined) {
            taskError = '这个 Host 没有开启自动会话（autoSession=false），任务没发出去。';
        }
        return {
            workspaceId,
            sessionId,
            ...(sessionError === undefined ? {} : { sessionError }),
            ...(taskError === undefined ? {} : { taskError }),
        };
    }
    /**
     * 为已有检出新建一个会话。Host 没有 agent 工厂时返回 null。
     *
     * 面板上的「新建会话」与创建后的自动激活共用它。
     */
    async newSession(id) {
        const record = this.existingRecord(id);
        const { sessionId } = await this.startSession(record);
        return { sessionId };
    }
    /**
     * 在检出目录里新建一个实时会话，可选地把任务发进它的第一轮。
     *
     * 会话的 cwd 不可变，所以「进入检出」只能用「以检出为 cwd 新开会话」实现；
     * 工作区会按 cwd 把这个会话归组到刚注册的项目下。Host 没有 agent 工厂时
     * 返回 null，调用方退回「工作区已就绪」。
     *
     * 任务是「唤醒一轮」而不是「插一句话」：`followup` 会把这条消息变成那个
     * agent 自己的一轮，它接着就会调工具、改文件——这才算真的进去干活了。
     */
    async startSession(record, task) {
        const agents = this.ctx.get('agents');
        if (agents === undefined || typeof agents.create !== 'function') {
            return {
                sessionId: null,
                ...(task === undefined ? {} : { taskError: '这个 Host 没有会话工厂，任务没地方发。' }),
            };
        }
        const sessionId = randomUUID();
        const handle = await agents.create({ sessionId, meta: { cwd: record.path } });
        if (task === undefined)
            return { sessionId };
        const followup = handle?.agent?.followup;
        if (typeof followup !== 'function')
            return { sessionId, taskError: '这个 Host 的 agent 不支持 followup，任务没发出去。' };
        try {
            followup.call(handle?.agent, userTextMessage(task));
            return { sessionId };
        }
        catch (error) {
            return { sessionId, taskError: describe(error) };
        }
    }
    /** 分支名：显式给的优先；否则前缀 + 名字。已存在一律拒绝，绝不复用别人的分支。 */
    async branchFor(repository, explicit, name) {
        const branch = typeof explicit === 'string' && explicit.trim() !== '' ? explicit.trim() : branchNameFor(name, this.branchPrefix);
        const valid = await runGit(Git.checkRefFormat(branch), {
            cwd: repository.root,
            timeoutMs: this.options.gitTimeoutMs,
        });
        if (valid.code !== 0)
            throw new DomainError('invalid-name', valid.stderr.trim() || 'invalid branch name');
        const exists = await runGit(Git.branchRef(branch), {
            cwd: repository.root,
            timeoutMs: this.options.gitTimeoutMs,
        });
        if (exists.code === 0)
            throw new DomainError('duplicate-branch', `branch ${branch} already exists`);
        return branch;
    }
    /**
     * 基线：显式 ref → `fresh`（远端默认分支，其次本地默认分支）→ 主仓当前 HEAD。
     * `fresh` 的价值是不把本地未推送的提交带进新检出。
     *
     * 返回值一定是提交 id（`Oid`），不是分支名——下游 `diff`/`apply` 会拿它算补丁，
     * 一个会移动的引用当基线，等于把这段时间里上游的提交算成本检出的修改。
     */
    async resolveBase(repository, explicit) {
        const timeoutMs = this.options.gitTimeoutMs;
        const options = { cwd: repository.root, timeoutMs };
        if (typeof explicit === 'string' && explicit.trim() !== '') {
            const ref = explicit.trim();
            const oid = await gitOid(Git.commitOf(ref), options, `baseline ${ref}`);
            return { oid, ref };
        }
        if (this.options.basePolicy === 'fresh' && repository.defaultBranch !== null) {
            for (const candidate of [`origin/${repository.defaultBranch}`, repository.defaultBranch]) {
                const resolved = await runGit(Git.commitOf(candidate), options);
                const oid = resolved.code === 0 ? asOid(resolved.stdout.trim()) : null;
                if (oid !== null)
                    return { oid, ref: candidate };
            }
        }
        if (repository.headOid === null)
            throw new DomainError('git-failed', 'the repository has no commits yet');
        return { oid: repository.headOid, ref: repository.branch };
    }
    async runConfigured(target) {
        const runs = [];
        for (const command of this.options.setupCommands) {
            const outcome = await runCommand(command, { cwd: target, timeoutMs: this.options.setupTimeoutMs });
            runs.push({ kind: 'setup', command, ...outcome });
            /* 后续 setup 通常依赖前一步，失败就停，别把噪声堆在报告里。 */
            if (!outcome.ok)
                return runs;
        }
        if (this.options.verifyCommand !== null) {
            const outcome = await runCommand(this.options.verifyCommand, { cwd: target, timeoutMs: this.options.setupTimeoutMs });
            runs.push({ kind: 'verify', command: this.options.verifyCommand, ...outcome });
        }
        return runs;
    }
    async apply(id) {
        const record = this.existingRecord(id);
        const base = this.baselineOf(record);
        return this.withLock(pathKey(record.repository), async () => {
            /* Git 级锁：挡住另一个进程/清理任务在应用期间删除同一个 worktree。 */
            const locked = await lockCheckout(record.repository, record.path, 'dsh-worktree:apply', this.options.gitTimeoutMs);
            try {
                const result = await applyCheckout({
                    repository: record.repository,
                    target: record.path,
                    baseOid: base,
                    timeoutMs: this.options.worktreeAddTimeoutMs,
                });
                this.invalidate(record.path);
                return result;
            }
            finally {
                if (locked)
                    await unlockCheckout(record.repository, record.path, this.options.gitTimeoutMs);
            }
        });
    }
    /**
     * 删除。有未提交改动、或有「只有本检出知道」的提交时默认拒绝；`force` 才继续，
     * 并在继续之前把内容钉成一个引用（`refs/dsh/archive/<id>`），
     * 这样「非要丢」也不是不可恢复。
     */
    async remove(id, options = {}) {
        const record = this.recordOf(id);
        const inspection = await inspectRemoval({
            repository: record.repository,
            target: record.path,
            baseOid: asOid(record.baseOid),
            timeoutMs: this.options.gitTimeoutMs,
        });
        if (options.force !== true) {
            if (inspection.dirty > 0)
                throw new DomainError('worktree-dirty');
            if (inspection.atRisk) {
                throw new DomainError(inspection.branch === null ? 'worktree-unmerged' : 'worktree-unpushed', inspection.uncertain
                    ? '这一删会丢什么现在查不出来（git 查询失败）：确认后再加 --force'
                    : inspection.branch === null
                        ? 'the detached worktree has commits no branch contains'
                        : `branch ${inspection.branch} has commits no other branch contains`);
            }
        }
        return this.withLock(pathKey(record.repository), async () => {
            let archivedOid = null;
            if (inspection.missing) {
                /* 目录已经不在：只清 Git 的失效登记，不碰任何用户数据。 */
                if (existsSync(record.repository)) {
                    await runGit(Git.worktreePrune(), {
                        cwd: record.repository,
                        timeoutMs: this.options.gitTimeoutMs,
                    });
                }
            }
            else {
                const locked = await lockCheckout(record.repository, record.path, 'dsh-worktree:remove', this.options.gitTimeoutMs);
                try {
                    /*
                     * 只有 detached 需要归档：分支模式的提交在分支上，删检出不会丢。
                     * 归档失败必须中止删除——「非要丢也不是不可恢复」的承诺，不能靠 catch 吞掉。
                     */
                    if (options.force === true && inspection.branch === null && (inspection.dirty > 0 || inspection.atRisk)) {
                        archivedOid = await archiveCheckout({
                            repository: record.repository,
                            target: record.path,
                            id: record.id,
                            timeoutMs: this.options.gitTimeoutMs,
                        });
                    }
                    await removeCheckout(record.repository, record.path, this.options.gitTimeoutMs);
                }
                finally {
                    if (locked)
                        await unlockCheckout(record.repository, record.path, this.options.gitTimeoutMs);
                }
            }
            this.registry.remove(id);
            this.invalidate(record.path);
            return { removed: true, archivedOid, branch: inspection.branch ?? record.branch };
        });
    }
    /**
     * 修改分支前缀。前缀拼上名字必须是合法引用；空串合法（不加前缀）。
     *
     * `git check-ref-format` 不需要仓库，所以这里不要求当前已经选中仓库。
     */
    async setBranchPrefix(value) {
        const prefix = typeof value === 'string' ? value.trim() : '';
        if (prefix.length > 48)
            throw new DomainError('invalid-layout', 'the branch prefix is too long');
        if (prefix !== '') {
            mkdirSync(this.options.stateDir, { recursive: true });
            const valid = await runGit(Git.checkRefFormat(prefix + 'probe'), {
                cwd: this.options.stateDir,
                timeoutMs: this.options.gitTimeoutMs,
            });
            if (valid.code !== 0) {
                throw new DomainError('invalid-layout', valid.stderr.trim() || 'invalid branch prefix');
            }
        }
        this.settings.write({ branchPrefix: prefix });
        return { branchPrefix: prefix };
    }
    /**
     * 清理失效残留：
     *
     *   1. 记录层：登记了但目录已不存在 → 删记录；
     *   2. Git 层：对所有已知仓库跑 `worktree prune`，把目录已不在的元数据收回。
     *      这一步会处理**不是本插件创建的**检出（它们没有记录，只有 Git 元数据），
     *      所以面板上那些外部创建、目录已丢失的行也能清掉；
     *   3. 被 lock 住的失效检出先 unlock 再 prune——Git 不会 prune 锁住的条目。
     *
     * 目录还在（哪怕空）一律不动。这是一次显式操作：外接盘/网络盘短暂不可用
     * 不该等同于「用户删掉了它」。
     */
    async prune() {
        const names = [];
        const repositories = new Set();
        for (const record of this.registry.list()) {
            repositories.add(record.repository);
            if (existsSync(record.path))
                continue;
            this.registry.remove(record.id);
            this.invalidate(record.path);
            names.push(record.name);
        }
        for (const info of await this.knownRepositories())
            repositories.add(info.mainRoot);
        const pruned = [];
        for (const repository of repositories) {
            if (!existsSync(repository))
                continue;
            const before = await listCheckouts(repository, this.options.gitTimeoutMs).catch(() => null);
            if (before === null)
                continue;
            const stale = before.filter((checkout) => checkout.prunable || !existsSync(checkout.path));
            for (const checkout of stale) {
                if (!checkout.locked)
                    continue;
                await runGit(Git.worktreeUnlock(checkout.path), {
                    cwd: repository,
                    timeoutMs: this.options.gitTimeoutMs,
                }).catch(() => undefined);
            }
            /* 单个仓库的元数据清理失败不应让已经成功的记录清理回滚。 */
            await runGit(Git.worktreePrune(), { cwd: repository, timeoutMs: this.options.gitTimeoutMs })
                .catch(() => undefined);
            const after = await listCheckouts(repository, this.options.gitTimeoutMs).catch(() => null);
            if (after === null)
                continue;
            for (const checkout of before) {
                if (!after.some((left) => samePath(left.path, checkout.path)))
                    pruned.push(checkout.path);
            }
        }
        return { removed: names.length, names, pruned };
    }
    async open(id) {
        const record = this.existingRecord(id);
        if (this.options.openPath === undefined)
            return { opened: false };
        this.options.openPath(record.path);
        return { opened: true };
    }
    /**
     * 把检出目录注册成官方工作区。
     *
     * 这是本 Harness 里最接近 `EnterWorktree` 的动作：会话的 cwd 在 header 里是
     * 不可变的，插件不能把当前会话搬进去，所以把目录变成「可以开新会话的工作区」。
     */
    async registerWorkspace(id) {
        const record = this.existingRecord(id);
        const workspaces = this.ctx.get('workspaceRegistry');
        if (workspaces === undefined)
            throw new DomainError('no-workspace');
        try {
            const existing = workspaces.list().find((workspace) => samePath(workspace.path, record.path));
            /* 标题就是侧栏里的「标注」：会话按 cwd 归到项目下，一眼能看出这是隔离检出。 */
            const title = record.branch === null
                ? `${record.repositoryName} · ${record.name} (detached)`
                : `${record.repositoryName} · ${record.branch}`;
            const workspace = existing ?? await workspaces.create(record.path, title);
            this.registry.update(id, { workspaceId: workspace.id });
            this.invalidate(record.path);
            return { workspaceId: workspace.id, path: record.path };
        }
        catch (error) {
            throw new DomainError('no-workspace', describe(error));
        }
    }
}
function toRepositoryView(info) {
    return {
        root: info.mainRoot,
        name: info.name,
        branch: info.branch,
        headOid: info.headOid,
        defaultBranch: info.defaultBranch,
    };
}
function pathKey(path) {
    return process.platform === 'win32' ? path.toLowerCase() : path;
}
function basenameOf(path) {
    const parts = path.split(/[\\/]/).filter((part) => part !== '');
    return parts[parts.length - 1] ?? path;
}
/** 在系统文件管理器里打开目录；失败不是调用方的问题。 */
export function openInFileManager(target) {
    const command = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    const child = spawn(command, [target], { detached: true, stdio: 'ignore' });
    child.on('error', () => { });
    child.unref();
}
