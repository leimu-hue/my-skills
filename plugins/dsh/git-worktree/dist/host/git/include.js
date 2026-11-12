/**
 * `.worktreeinclude`：把「既匹配 include 模式、又被 Git 忽略」的文件带进新 worktree。
 *
 * 两次 Git 查询求交，而不是遍历整棵 ignored 树：
 *   1. `ls-files --others --ignored --exclude-from=.worktreeinclude`
 *      给出 include 模式命中的未跟踪文件（通常只有几个，node_modules 不会被列出来）；
 *   2. `check-ignore --stdin` 确认它们确实被仓库的 ignore 规则覆盖。
 *
 * 于是 tracked 文件永远不会被重复复制，普通 untracked 文件也不会被误带。
 *
 * 复制本身有上限：单文件 1 MiB、总计 8 MiB、最多 200 个；超出只计入 skipped，
 * 不影响 worktree 创建。目标已存在时用 `COPYFILE_EXCL` 跳过——绝不覆盖已检出的内容。
 */
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DomainError } from "../shared/errors.js";
import { isInside } from "../shared/paths.js";
import { Git } from "./commands.js";
import { runGit } from "./exec.js";
const INCLUDE_FILE = '.worktreeinclude';
const MAX_INCLUDE_BYTES = 128 * 1024;
const MAX_FILES = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_CANDIDATES = MAX_FILES * 4;
const MAX_REPORTED = 50;
/** 只接受仓库内、无穿越的相对路径（Git 输出已保证，但这里是最后一道）。 */
function safeRelative(path) {
    if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path))
        return false;
    return !path.split('/').some((part) => part === '' || part === '.' || part === '..');
}
export async function copyWorktreeIncludes(repository, target, timeoutMs) {
    const includePath = join(repository, INCLUDE_FILE);
    let content;
    try {
        const info = await stat(includePath);
        if (!info.isFile() || info.size === 0)
            return { copied: [], skipped: 0 };
        if (info.size > MAX_INCLUDE_BYTES) {
            throw new DomainError('too-large', '.worktreeinclude exceeds 128 KiB');
        }
        content = await readFile(includePath, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { copied: [], skipped: 0 };
        throw error;
    }
    if (content.trim() === '')
        return { copied: [], skipped: 0 };
    const listed = await runGit(Git.ignoredByInclude(includePath), {
        cwd: repository,
        timeoutMs,
        maxBytes: 4 * 1024 * 1024,
    });
    if (listed.code !== 0) {
        throw new DomainError('git-failed', listed.stderr.trim() || 'cannot match .worktreeinclude');
    }
    const candidates = listed.stdout
        .split('\0')
        .filter((path) => path !== '' && safeRelative(path))
        .slice(0, MAX_CANDIDATES);
    if (candidates.length === 0)
        return { copied: [], skipped: 0 };
    /* 只有也被仓库忽略的才复制；tracked 与普通 untracked 一律不动。 */
    const ignored = await runGit(Git.checkIgnoredStdin(), {
        cwd: repository,
        timeoutMs,
        input: candidates.join('\0') + '\0',
        maxBytes: 4 * 1024 * 1024,
    });
    const eligible = new Set(ignored.stdout.split('\0').filter((path) => path !== ''));
    const copied = [];
    let skipped = 0;
    let total = 0;
    for (const relative of candidates) {
        if (!eligible.has(relative))
            continue;
        const source = resolve(repository, relative);
        const destination = resolve(target, relative);
        if (!isInside(repository, source) || !isInside(target, destination)) {
            skipped += 1;
            continue;
        }
        try {
            const info = await stat(source);
            if (!info.isFile() || info.size > MAX_FILE_BYTES || total + info.size > MAX_TOTAL_BYTES || copied.length >= MAX_FILES) {
                skipped += 1;
                continue;
            }
            await mkdir(dirname(destination), { recursive: true });
            /* COPYFILE_EXCL：已检出的同名文件属于 worktree，绝不覆盖。 */
            await copyFile(source, destination, constants.COPYFILE_EXCL);
            total += info.size;
            copied.push(relative);
        }
        catch {
            /* 已存在、来不及读、权限不足：都只是「没带过去」，不该让创建失败。 */
            skipped += 1;
        }
    }
    return { copied: copied.slice(0, MAX_REPORTED), skipped };
}
