/**
 * 路径、身份、原子写与那把唯一的写锁。
 *
 * 整个模块只守一条规则：**所有**路径比较（这个在不在这个根里？两个根是否重叠？
 * 这是不是同一条技能？）都必须走 `pathId()` / `pathIdSync()`。在 Windows 上意味着
 * 「能 realpath 就 realpath，然后转小写」—— 这样 `C:\Users\x\.dsh\Skills` 这种大小写变体
 * 就没法冒充成另一个来源。
 */
import { existsSync, renameSync } from 'node:fs';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
const WIN = process.platform === 'win32';
/** 按宿主自带 bundle 的口径解析 DSH 主目录。 */
export function resolveDshHome(configured) {
    if (typeof configured === 'string' && configured.trim() !== '')
        return resolve(configured.trim());
    const fromEnv = process.env.DSH_HOME;
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '')
        return resolve(fromEnv.trim());
    return join(homedir(), '.dsh');
}
export function resolveAgentsHome() {
    const fromEnv = process.env.DSH_AGENTS_HOME;
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '')
        return resolve(fromEnv.trim());
    return join(homedir(), '.agents');
}
/** 存在就取 realpath，不存在就普通 resolve（永不抛错）。 */
export async function realOrResolved(path) {
    try {
        return await realpath(path);
    }
    catch {
        return resolve(path);
    }
}
/**
 * 路径的规范身份：realpath +（Windows 上）转小写。
 *
 * 只对 Windows 转小写是刻意的：在大小写敏感的文件系统上，大小写不同的两个名字
 * 就是两条不同的技能。
 */
export async function pathId(path) {
    const real = await realOrResolved(path);
    return WIN ? real.toLowerCase() : real;
}
/** 同步版本，给「路径已经解析过」的热点比较用。 */
export function pathIdSync(path) {
    const absolute = resolve(path);
    return WIN ? absolute.toLowerCase() : absolute;
}
/** `candidate` 是否就是 `root` 或位于其下。两侧都先规范化。 */
export function isInside(root, candidate) {
    const rootId = pathIdSync(root);
    const candidateId = pathIdSync(candidate);
    if (rootId === candidateId)
        return true;
    const rel = relative(rootId, candidateId);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
/** 两个根是否有重叠（任一方向，较紧的那个胜出）。 */
export function pathsOverlap(left, right) {
    return isInside(left, right) || isInside(right, left);
}
/**
 * 原子写文件：同目录先写临时文件，再带一小段重试地 rename。
 *
 * 为什么要重试：Windows 上另一个进程（编辑器、杀毒、宿主自己的 watcher）可能正好
 * 打开着目标文件几十毫秒，此时的 rename 会以 EPERM / EBUSY 失败。
 */
export async function writeFileAtomic(path, data, mode = 0o600) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now().toString(36)}`);
    try {
        await writeFile(tmp, data, { mode });
        await renameWithRetry(tmp, path);
    }
    catch (error) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw error;
    }
}
async function renameWithRetry(from, to, attempts = 6) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await rename(from, to);
            return;
        }
        catch (error) {
            lastError = error;
            const code = error.code;
            if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')
                throw error;
            await delay(20 * (attempt + 1));
        }
    }
    throw lastError;
}
export function delay(ms) {
    return new Promise((done) => setTimeout(done, ms));
}
/**
 * 每个插件实例一把串行队列，所有状态写入都从它里面过。
 *
 * 写是一条「读、改、写全在锁内」的函数，所以两次写之间崩溃不会留下半成品状态。
 */
export function createLock() {
    let tail = Promise.resolve();
    return (task) => {
        const run = tail.then(task, task);
        tail = run.then(() => undefined, () => undefined);
        return run;
    };
}
/**
 * 一次性把旧布局 `$DSH_HOME/skill-manager/` 搬到 `$DSH_HOME/tool-center/`。
 *
 * 为什么同步做：这是启动最早的一步，任何服务都还没开始读这些文件，所以不存在并发窗口；
 * 用异步反而要在 apply 里等一个 Promise，而 cordis 的 apply 是同步契约。
 * 失败只当没发生（宁可丢一次迁移，也不能让插件挂不上）。
 */
export function migrateLegacyLayout(dshHome) {
    const from = join(dshHome, 'skill-manager');
    const to = join(dshHome, 'tool-center');
    if (existsSync(to) || !existsSync(from))
        return { moved: false, from, to };
    try {
        renameSync(from, to);
        return { moved: true, from, to };
    }
    catch {
        return { moved: false, from, to };
    }
}
