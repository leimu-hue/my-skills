/**
 * 导入 / 导出。
 *
 * 两条不变式：
 *   * **平铺技能读 `docPath`，不读 `entryPath`**：`entryPath` 是它所在目录，导出平铺技能
 *     会直接 EISDIR；
 *   * **落在任何技能目录之外的文件必须报出来**，不能静默丢掉 —— 「压缩包导入成功但
 *     references/ 不见了」正是这个插件要避免的那种静默损失。
 */
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { DomainError } from '../../shared/result.js';
import { exists, isFile, statOrNull } from '../../shared/fs.js';
import { isInside } from '../../shared/paths.js';
import { readZip, writeZip } from '../../shared/zip.js';
import { assertSkillName, assertWritable, copyTree, isValidSkillName, targetOf } from './guard.js';
/** 从磁盘上的一个目录或一个 `.md` 文件导入技能。 */
export async function importFromPath(root, sourcePath) {
    assertWritable(root);
    const info = await statOrNull(sourcePath);
    if (info === null)
        throw new DomainError('error.import.missing', `路径不存在：${sourcePath}`);
    const bundled = info.isDirectory() && (await isFile(join(sourcePath, 'SKILL.md')));
    const name = info.isDirectory() ? basename(sourcePath) : basename(sourcePath).replace(/\.md$/i, '');
    assertSkillName(name);
    const imported = [];
    const skipped = [];
    if (info.isDirectory() && !bundled) {
        // 整个技能目录：把每个含 SKILL.md 的子目录各导入一条。
        for (const child of await readdir(sourcePath)) {
            if (child.startsWith('.'))
                continue;
            const childPath = join(sourcePath, child);
            if (!(await isFile(join(childPath, 'SKILL.md')))) {
                skipped.push({ name: child, reason: '不是技能目录（没有 SKILL.md）' });
                continue;
            }
            const target = targetOf(root, child);
            if (await exists(target)) {
                skipped.push({ name: child, reason: '同名技能已存在' });
                continue;
            }
            await copyTree(childPath, target);
            imported.push({ name: child, files: (await listTree(target)).length });
        }
        return { imported, skipped };
    }
    const target = info.isDirectory() ? targetOf(root, name) : targetOf(root, `${name}.md`);
    if (await exists(target)) {
        skipped.push({ name, reason: '同名技能已存在' });
        return { imported, skipped };
    }
    if (info.isDirectory())
        await copyTree(sourcePath, target);
    else
        await copyFile(sourcePath, target);
    imported.push({ name, files: info.isDirectory() ? (await listTree(target)).length : 1 });
    return { imported, skipped };
}
/**
 * 导入一个 zip 里的全部技能。
 *
 * 一条技能 = 任何含 `SKILL.md` 的目录（任意深度），外加顶层的 `*.md`。技能名取它自己的
 * 目录名，每个文件按**相对该目录**的路径落盘 —— 所以 `dist/my-skill/SKILL.md` 与
 * `my-skill/SKILL.md` 都产出 `my-skill/SKILL.md`，而 `dist/my-skill/references/a.md`
 * 会保住它的 `references/` 目录。
 */
export async function importZip(root, buffer) {
    assertWritable(root);
    const files = readZip(buffer);
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
    // 第二遍：每个文件归属到它上方最内层的那条技能目录。
    const byDirectory = new Map();
    const flat = [];
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
            flat.push(file);
            continue;
        }
        orphans.push(file.name);
    }
    const imported = [];
    const skipped = [];
    const taken = new Set();
    for (const [directory, entries] of byDirectory) {
        if (directory === '') {
            // SKILL.md 直接躺在压缩包根部时没有目录名可当技能名；随便猜一个名字静默导入
            // 只会让人意外。
            skipped.push({ name: '（压缩包根目录）', reason: 'SKILL.md 在压缩包根部，没有目录名可用；请把它放进一个文件夹再打包' });
            continue;
        }
        const name = basename(directory);
        if (!isValidSkillName(name)) {
            skipped.push({ name: name || '(root)', reason: '技能名不合法（必须是 kebab-case）' });
            continue;
        }
        if (taken.has(name)) {
            skipped.push({ name, reason: '压缩包里还有另一条同名技能' });
            continue;
        }
        const target = targetOf(root, name);
        if (await exists(target)) {
            skipped.push({ name, reason: '同名技能已存在' });
            continue;
        }
        await mkdir(target, { recursive: true });
        const prefix = directory + '/';
        let count = 0;
        let unsafe = false;
        for (const entry of entries) {
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
            skipped.push({ name, reason: '压缩包里有越界路径' });
            continue;
        }
        taken.add(name);
        imported.push({ name, files: count });
    }
    for (const file of flat) {
        const name = file.name.replace(/\.md$/i, '');
        if (!isValidSkillName(name)) {
            skipped.push({ name, reason: '技能名不合法（必须是 kebab-case）' });
            continue;
        }
        const target = targetOf(root, `${name}.md`);
        if (await exists(target)) {
            skipped.push({ name, reason: '同名技能已存在' });
            continue;
        }
        await writeFile(target, file.data, { mode: 0o600 });
        imported.push({ name, files: 1 });
    }
    if (orphans.length > 0) {
        skipped.push({ name: `${orphans.length} 个文件不在任何技能目录下`, reason: orphans.slice(0, 8).join(', ') });
    }
    return { imported, skipped, groups: byDirectory.size + flat.length };
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
