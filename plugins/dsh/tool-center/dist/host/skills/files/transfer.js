/**
 * 导入 / 导出。
 *
 * 两条不变式：
 *   * **平铺技能读 `docPath`，不读 `entryPath`**：`entryPath` 是它所在目录，导出平铺技能
 *     会直接 EISDIR；
 *   * **落在任何技能目录之外的文件必须报出来**，不能静默丢掉 —— 「压缩包导入成功但
 *     references/ 不见了」正是这个插件要避免的那种静默损失。报出来分两档：能确定与技能
 *     无关的（系统垃圾、bundle 级说明与清单）只计数；说不清楚的逐条列出「文件 — 原因」。
 */
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { DomainError } from '../../shared/result.js';
import { exists } from '../../shared/fs.js';
import { isInside } from '../../shared/paths.js';
import { readZip, writeZip } from '../../shared/zip.js';
import { assertWritable, isValidSkillName, targetOf } from './guard.js';
/* --------------------------------- 过滤规则 -------------------------------- */
/**
 * 系统 / 编辑器垃圾：整条路径里出现这些目录，或者文件名命中这些模式，就不必再看了。
 *
 * 刻意**不**把 `.gitignore` / `.editorconfig` 这类配置算进来：它们可能真是技能包里带的
 * 文件（导出时也会原样带走），一刀砍掉就是静默丢文件。它们只在「无主」时才被忽略，见
 * `isRepoConfig`。
 */
const JUNK_DIRECTORIES = new Set(['__macosx', '.git', '.svn', '.hg', '.idea', '.vscode', 'node_modules']);
const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const JUNK_SUFFIXES = ['.swp', '.swo', '.tmp', '.crdownload', '.part'];
/** 说明 / 清单类扩展名：与技能目录并列出现时，它们显然不是技能文件。 */
const DOC_EXTENSIONS = ['.md', '.markdown', '.json', '.yml', '.yaml', '.txt'];
/** 这条路径是不是系统垃圾（`__MACOSX/`、`.DS_Store`、`~$x.docx` 等）。 */
function isJunkPath(name) {
    const segments = segmentsOf(name);
    if (segments.some((segment) => JUNK_DIRECTORIES.has(segment.toLowerCase())))
        return true;
    const base = (segments.at(-1) ?? '').toLowerCase();
    if (base === '' || JUNK_NAMES.has(base))
        return true;
    if (base.startsWith('~$') || base.startsWith('.~lock.') || base.endsWith('~'))
        return true;
    return JUNK_SUFFIXES.some((suffix) => base.endsWith(suffix));
}
/** 说明 / 清单类文件（与技能目录并列时，导入它们没有任何意义）。 */
function isDocLike(name) {
    const base = (segmentsOf(name).at(-1) ?? '').toLowerCase();
    if (base === 'skill.md')
        return false;
    return DOC_EXTENSIONS.some((extension) => base.endsWith(extension));
}
/** 仓库 / 编辑器配置的隐藏文件：只在「不属于任何技能」时才忽略。 */
function isRepoConfig(name) {
    const base = segmentsOf(name).at(-1) ?? '';
    return base.startsWith('.') && !isJunkPath(name);
}
/**
 * 解析一个压缩包，**不写盘**。
 *
 * 一条技能 = 任何含 `SKILL.md` 的目录（任意深度），外加顶层的 `*.md`。技能名取它自己的
 * 目录名，每个文件按**相对该目录**的路径落盘 —— 所以 `dist/my-skill/SKILL.md` 与
 * `my-skill/SKILL.md` 都产出 `my-skill/SKILL.md`，而 `dist/my-skill/references/a.md`
 * 会保住它的 `references/` 目录。
 *
 * 落到技能目录之外的文件分两档，都不静默丢，但不混在一起：
 *   * `ignored`：一看就与技能无关（`__MACOSX/`、`.DS_Store`、与技能目录并列的
 *     `bundle-manifest.json` / `使用指引.md` 这类说明与清单）—— 界面只报个数；
 *   * `orphans`：说不清楚的**逐条列出**（「文件 — 原因」），例如一个只有 `references/`
 *     却没有 `SKILL.md` 的目录。压缩包导入后少文件，正是这一档要防的事。
 */
function planZip(buffer) {
    const raw = readZip(buffer);
    const ignored = [];
    const files = raw.filter((file) => {
        if (!isJunkPath(file.name))
            return true;
        ignored.push({ path: file.name, code: 'junk', reason: '系统 / 编辑器临时文件' });
        return false;
    });
    // 第一遍：哪些目录是技能？（含 SKILL.md 的目录）
    const skillDirectories = new Set();
    for (const file of files) {
        const segments = segmentsOf(file.name);
        const docIndex = segments.lastIndexOf('SKILL.md');
        if (docIndex >= 0)
            skillDirectories.add(segments.slice(0, docIndex).join('/'));
    }
    // 最长前缀优先：这样嵌在某个技能 bundle 内部的另一个技能，自己的文件不会被外层吞掉。
    const ordered = [...skillDirectories].sort((left, right) => right.length - left.length);
    /* 「装技能的目录」= 技能目录的父目录，外加压缩包根部。与这些目录**并列**的说明 / 清单
       文件（bundle-manifest.json、使用指引.md）属于 bundle 自身的元数据，不是技能文件。 */
    const containerDirectories = new Set(['']);
    for (const directory of skillDirectories) {
        if (directory === '')
            continue;
        containerDirectories.add(segmentsOf(directory).slice(0, -1).join('/'));
    }
    // 第二遍：每个文件归属到它上方最内层的那条技能目录。
    const byDirectory = new Map();
    const flatFiles = [];
    const orphans = [];
    for (const file of files) {
        const segments = segmentsOf(file.name);
        if (segments.length === 0)
            continue;
        const owner = ordered.find((directory) => (directory === '' ? true : file.name.startsWith(directory + '/')));
        if (owner !== undefined) {
            const list = byDirectory.get(owner);
            if (list === undefined)
                byDirectory.set(owner, [file]);
            else
                list.push(file);
            continue;
        }
        const lowered = segments[0].toLowerCase();
        if (segments.length === 1 && lowered.endsWith('.md') && lowered !== 'skill.md') {
            flatFiles.push(file);
            continue;
        }
        const parent = segments.slice(0, -1).join('/');
        if (containerDirectories.has(parent) && isDocLike(file.name)) {
            ignored.push({ path: file.name, code: 'bundleDoc', reason: 'bundle 级说明或清单，不是技能文件' });
            continue;
        }
        // 无主的仓库 / 编辑器配置（`.gitignore`、`.editorconfig`）：不是技能文件，也不必报成问题。
        if (isRepoConfig(file.name)) {
            ignored.push({ path: file.name, code: 'meta', reason: '仓库 / 编辑器配置，不属于任何技能' });
            continue;
        }
        orphans.push({ path: file.name, code: 'noDoc', reason: '不在任何技能目录下（所在目录没有 SKILL.md）' });
    }
    const skills = [];
    const rejected = [];
    const taken = new Set();
    for (const [directory, entries] of byDirectory) {
        if (directory === '') {
            // SKILL.md 直接躺在压缩包根部时没有目录名可当技能名；随便猜一个名字静默导入
            // 只会让人意外。
            rejected.push({ name: '（压缩包根目录）', reason: 'SKILL.md 在压缩包根部，没有目录名可用；请把它放进一个文件夹再打包' });
            continue;
        }
        const name = basename(directory);
        if (!isValidSkillName(name)) {
            rejected.push({ name: name || '(root)', reason: '技能名不合法（必须是 kebab-case）' });
            continue;
        }
        if (taken.has(name)) {
            rejected.push({ name, reason: '压缩包里还有另一条同名技能' });
            continue;
        }
        taken.add(name);
        skills.push({ name, directory, entries, flat: false });
    }
    // 顶层平铺的 `*.md` 也算一条技能（single-file skill）。
    for (const file of flatFiles) {
        const name = file.name.replace(/\.md$/i, '');
        if (!isValidSkillName(name)) {
            rejected.push({ name, reason: '技能名不合法（必须是 kebab-case）' });
            continue;
        }
        if (taken.has(name)) {
            rejected.push({ name, reason: '压缩包里还有另一条同名技能' });
            continue;
        }
        taken.add(name);
        skills.push({ name, directory: '', entries: [file], flat: true });
    }
    return { skills, rejected, orphans, ignored };
}
/** 一条技能落盘的目标路径（bundle 是目录，平铺是 `.md` 文件）。 */
function targetOfSkill(root, skill) {
    return targetOf(root, skill.flat ? `${skill.name}.md` : skill.name);
}
/** 扫描一个压缩包：给出可勾选的候选（含「已存在」标记），不写盘。 */
export async function scanZip(root, buffer) {
    const plan = planZip(buffer);
    const candidates = [];
    for (const skill of plan.skills) {
        candidates.push({
            name: skill.name,
            files: skill.entries.length,
            exists: await exists(targetOfSkill(root, skill)),
            flat: skill.flat,
        });
    }
    return { candidates, rejected: plan.rejected, orphans: plan.orphans, ignored: plan.ignored };
}
/**
 * 导入压缩包里的技能；给了 `only` 就只导入这些名字（面板的勾选结果）。
 *
 * 不传 `only` 等于「全导入」—— 与旧行为一致，工具 / 脚本仍能一次搬完。
 */
export async function importZip(root, buffer, only) {
    assertWritable(root);
    const plan = planZip(buffer);
    const wanted = only === undefined || only.length === 0 ? undefined : new Set(only);
    const imported = [];
    const skipped = [];
    for (const rejection of plan.rejected)
        skipped.push(rejection);
    // 逐条报，不聚合：少的是哪几个文件，得能照着路径去找。
    for (const note of plan.orphans)
        skipped.push({ name: note.path, reason: note.reason, code: note.code });
    for (const skill of plan.skills) {
        if (wanted !== undefined && !wanted.has(skill.name))
            continue;
        const target = targetOfSkill(root, skill);
        if (await exists(target)) {
            skipped.push({ name: skill.name, reason: '同名技能已存在' });
            continue;
        }
        if (skill.flat) {
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, skill.entries[0].data, { mode: 0o600 });
            imported.push({ name: skill.name, files: 1 });
            continue;
        }
        await mkdir(target, { recursive: true });
        const prefix = skill.directory + '/';
        let count = 0;
        let unsafe = false;
        for (const entry of skill.entries) {
            const inner = entry.name.startsWith(prefix) ? entry.name.slice(prefix.length) : basename(entry.name);
            const destination = join(target, inner);
            if (!isInside(target, destination) || destination === target) {
                unsafe = true;
                break;
            }
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, entry.data, { mode: 0o600 });
            count += 1;
        }
        if (unsafe) {
            await rm(target, { recursive: true, force: true }).catch(() => undefined);
            skipped.push({ name: skill.name, reason: '压缩包里有越界路径' });
            continue;
        }
        imported.push({ name: skill.name, files: count });
    }
    return { imported, skipped, ignored: plan.ignored.length, groups: plan.skills.length + plan.rejected.length };
}
/** 把给定的行导出成一个 zip，每条技能放在自己的声明名下。 */
export async function exportRowsAsZip(rows) {
    const files = [];
    const used = new Set();
    for (const row of rows) {
        let name = row.declaredName || row.name;
        if (used.has(name))
            name = `${name}-${row.rootKey.replace(/[^a-z0-9-]/gi, '')}`;
        used.add(name);
        for (const file of await collectFiles(row)) {
            files.push({ name: `${name}/${file.relative}`, data: await readFile(file.absolute) });
        }
    }
    if (files.length === 0)
        throw new DomainError('error.export.empty', '没有可导出的技能');
    return { buffer: writeZip(files), files: files.length };
}
/** 把一条技能导出成一个 zip。 */
export async function exportRowAsZip(row) {
    return (await exportRowsAsZip([row])).buffer;
}
/* -------------------------------- 内部工具 -------------------------------- */
function segmentsOf(name) {
    return name.split('/').filter((segment) => segment !== '');
}
/**
 * 一条技能要进 zip 的所有文件。
 *
 * 平铺技能必须读 `docPath`（那个 `.md` 文件本身），而不是 `entryPath`（它所在目录）：
 * 早先这里读的是目录，导出平铺技能会直接 EISDIR。
 */
async function collectFiles(row) {
    if (row.form === 'flat')
        return [{ relative: 'SKILL.md', absolute: row.docPath }];
    return listTree(row.entryPath);
}
/** 一个技能 bundle 目录下的全部文件（zip 相对路径 + 绝对路径）。 */
async function listTree(entryPath) {
    const out = [];
    const walk = async (directory) => {
        for (const name of await readdir(directory)) {
            if (name === '.git' || name === 'node_modules')
                continue;
            const absolute = join(directory, name);
            const info = await lstat(absolute);
            if (info.isSymbolicLink())
                continue;
            if (info.isDirectory())
                await walk(absolute);
            else
                out.push({ relative: relative(entryPath, absolute).split('\\').join('/'), absolute });
        }
    };
    await walk(entryPath);
    return out;
}
