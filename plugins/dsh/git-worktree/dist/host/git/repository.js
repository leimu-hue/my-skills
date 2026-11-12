/**
 * 仓库探测：一次拿到「这个目录是谁、归属哪个主仓、是不是已经在隔离里」。
 *
 * 关键修正是 **主仓归位**：会话可能开在 linked worktree 里，此时
 * `--show-toplevel` 给出的是那个 worktree，而不是主仓。worktree 只能归属主仓，
 * 否则第二次创建会在 worktree 里再套一层。用 `GIT_DIR != GIT_COMMON` 判定，
 * 再用 `--show-superproject-working-tree` 把 submodule 排除掉——submodule 里
 * 这两个目录同样不相等，但它是普通检出。
 *
 * 缓存只回答「某个目录的探测结果是什么」，**不回答「主仓是什么」**：
 * 早年把同一份结果同时挂在 `root` 和 `mainRoot` 两个键下，于是 30 秒内从检出
 * 切回主仓时，主仓被描述成「一个 linked worktree」，`create` 直接返回
 * `already-isolated`。缓存是加速，不是事实。
 */
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { DomainError } from "../shared/errors.js";
import { samePath } from "../shared/paths.js";
import { Git, asOid } from "./commands.js";
import { gitText, runGit } from "./exec.js";
const CACHE_TTL_MS = 30_000;
const cache = new Map();
/** 缓存键：解析成绝对路径并按平台归一化大小写。不同写法只是未命中，不会串台。 */
function cacheKey(path) {
    const absolute = resolve(path);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}
/** `git --version` 只问一次：它不随仓库变化，只用于诊断。 */
let cachedVersion = null;
async function readVersion(cwd, timeoutMs) {
    if (cachedVersion !== null)
        return cachedVersion;
    const result = await runGit(Git.version(), { cwd, timeoutMs });
    if (result.code !== 0)
        return undefined;
    const version = result.stdout.trim().replace(/^git version\s*/i, '');
    if (version !== '')
        cachedVersion = version;
    return cachedVersion ?? undefined;
}
/**
 * 目录 → 仓库信息。不在仓库里时抛 `not-a-repository`。
 *
 * 命令数刻意压到 3 条：路径三件套一次 rev-parse 输出，submodule 探测一次，
 * 分支 + HEAD 两条；默认分支只在主仓上额外问一次。
 */
export async function inspectRepository(path, options) {
    if (options.fresh !== true) {
        const cached = cache.get(cacheKey(path));
        if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS)
            return cached.value;
    }
    const base = { cwd: path, timeoutMs: options.timeoutMs };
    const paths = await runGit(Git.probeLayout(), base);
    if (paths.code !== 0) {
        throw new DomainError('not-a-repository', `${path}: ${paths.stderr.trim() || 'not a git repository'}`);
    }
    const lines = paths.stdout.split(/\r?\n/).filter((line) => line !== '');
    if (lines.length < 3) {
        throw new DomainError('not-a-repository', `${path}: cannot resolve repository directories`);
    }
    const [toplevel, commonDirRaw, gitDirRaw] = lines;
    const root = await realpath(toplevel);
    const commonDir = await realpath(commonDirRaw);
    const gitDir = await realpath(gitDirRaw);
    const head = await readHead(path, options.timeoutMs);
    const isSubmodule = await detectSubmodule(path, options.timeoutMs);
    /* submodule 里 GIT_DIR != GIT_COMMON 同样成立，所以顺序不能反。 */
    const isWorktree = !isSubmodule && !samePath(gitDir, commonDir);
    const mainRoot = isWorktree ? await resolveMainRoot(root, commonDir, options.timeoutMs) : root;
    const defaultBranch = await readDefaultBranch(mainRoot, head.branch, options.timeoutMs);
    const version = await readVersion(root, options.timeoutMs);
    const value = {
        root,
        mainRoot,
        name: basename(mainRoot),
        branch: head.branch,
        headOid: head.oid,
        defaultBranch,
        ...(version === undefined ? {} : { version }),
        commonDir,
        gitDir,
        isWorktree,
        isSubmodule,
    };
    cache.set(cacheKey(path), { at: Date.now(), value });
    return value;
}
/** 主仓根目录：常规布局下就是 common dir 的父目录；异常布局再问 Git 自己。 */
async function resolveMainRoot(root, commonDir, timeoutMs) {
    if (basename(commonDir) === '.git') {
        const candidate = dirname(commonDir);
        try {
            if ((await stat(candidate)).isDirectory())
                return await realpath(candidate);
        }
        catch {
            /* 落到下面的 Git 查询。 */
        }
    }
    const listed = await runGit(Git.worktreeList(), { cwd: root, timeoutMs });
    const first = listed.code === 0
        ? listed.stdout.split(/\r?\n/).find((line) => line.startsWith('worktree '))
        : undefined;
    if (first === undefined)
        return root;
    return realpath(first.slice('worktree '.length).trim());
}
/** `--show-superproject-working-tree` 输出非空 = 这个 checkout 属于 submodule。 */
async function detectSubmodule(cwd, timeoutMs) {
    const result = await runGit(Git.superproject(), { cwd, timeoutMs });
    return result.code === 0 && result.stdout.trim() !== '';
}
/**
 * 分支名与 HEAD 分两条命令读。
 *
 * 曾经写成 `rev-parse --abbrev-ref HEAD HEAD`：`--abbrev-ref` 是作用于全部 rev 的
 * 全局开关，第二行同样是缩写后的**分支名**而不是提交 id，于是 `headOid` 存进了
 * `master`，`git diff master <head>` 把上游提交当成本检出的删除，应用回主仓就是
 * 反向撤销别人的工作。分支用 `symbolic-ref`、id 用 `rev-parse` 才各归各位。
 */
async function readHead(cwd, timeoutMs) {
    const options = { cwd, timeoutMs };
    const symbolic = await runGit(Git.currentBranch(), options);
    const ref = symbolic.code === 0 ? symbolic.stdout.trim() : '';
    const head = await runGit(Git.headOid(), options);
    return {
        branch: ref === '' || ref === 'HEAD' ? null : ref,
        oid: head.code === 0 ? asOid(head.stdout.trim()) : null,
    };
}
/**
 * 默认分支：`origin/HEAD` 是唯一的权威说法；没有远端时退到 main / master，
 * 最后才退到当前分支。用它当基线，新建的检出不会带上本地未推送的提交。
 *
 * 只读本地引用：`git remote show origin` 会联网，还会等凭据输入。
 */
async function readDefaultBranch(mainRoot, fallback, timeoutMs) {
    const options = { cwd: mainRoot, timeoutMs };
    const remote = await runGit(Git.remoteHead(), options);
    if (remote.code === 0) {
        const name = remote.stdout.trim().replace(/^origin\//, '');
        if (name !== '')
            return name;
    }
    for (const candidate of ['main', 'master']) {
        const exists = await runGit(Git.branchRef(candidate), options);
        if (exists.code === 0)
            return candidate;
    }
    return fallback;
}
/** 供测试与诊断：清掉进程内缓存。 */
export function forgetRepositoryCache() {
    cache.clear();
}
/** `git rev-parse` 的路径解释辅助：给需要 index 路径的调用方用。 */
export async function indexPathOf(cwd, timeoutMs) {
    try {
        const path = await gitText(Git.indexPath(), { cwd, timeoutMs });
        return path === '' ? null : path;
    }
    catch {
        return null;
    }
}
