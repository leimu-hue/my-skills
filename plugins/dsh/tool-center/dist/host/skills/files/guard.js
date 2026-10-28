/**
 * 文件操作的安全边界。
 *
 * 两条规则在这里集中落地，其它文件操作模块只管写：
 *   * **出不了根目录。** 每个目标路径在任何写入之前都会解析并与所属来源比对（`isInside`），
 *     所以 `../../etc` 这种构造出来的名字逃不出去；
 *   * **只搬一条技能。** 平铺技能的 `entryPath` 是所在目录（也就是整个来源根），
 *     照它搬家会把一整片技能目录移走，所以搬之前必须确认「要搬的只是这一条」。
 */
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { DomainError } from "../../shared/result.js";
import { isInside } from "../../shared/paths.js";
import { isHostSkillName } from "../frontmatter.js";
/** 与宿主一致的命名规则；定义在 `frontmatter.ts`，扫描与写入共用同一份。 */
export function isValidSkillName(name) {
    return isHostSkillName(name);
}
/** 技能名必须是 kebab-case；否则报一个面板能直接显示的错误。 */
export function assertSkillName(name) {
    if (!isValidSkillName(name)) {
        throw new DomainError('error.name.invalid', `技能名必须是 kebab-case（小写字母、数字、连字符）：${name}`);
    }
}
/** 把 `name` 解析到 `root` 之下，并拒绝任何越界结果。 */
export function targetOf(root, name) {
    const target = resolve(join(root.path, name));
    if (!isInside(root.path, target) || resolve(target) === resolve(root.path)) {
        throw new DomainError('error.path.escape', `目标路径不在技能目录内：${name}`);
    }
    return target;
}
export function assertWritable(root) {
    if (!root.writable) {
        throw new DomainError('error.root.readonly', `该技能目录是只读的：${root.label}（${root.path}）`);
    }
}
export function assertRowWritable(row) {
    if (!row.rootWritable) {
        throw new DomainError('error.root.readonly', `该技能目录是只读的：${row.rootLabel}`);
    }
}
/**
 * 确认「要搬走的东西」确实只是这一条技能，而不是它所在的整个目录。
 *
 * 这个断言的理由很具体：平铺技能的 entryPath 是所在目录，早先版本按 entryPath 搬家，
 * 一次删除会把整个来源目录移进回收站。宁可拒绝，也不能搬走比一条技能更多的东西。
 */
export function assertOneSkill(source, row) {
    const base = basename(source);
    if (row.form === 'flat') {
        if (base.toLowerCase() !== `${row.name}.md`.toLowerCase()) {
            throw new DomainError('error.delete.unsafe', `拒绝删除：目标不是这一条技能的文件（${source}）`);
        }
        return;
    }
    if (base !== row.name) {
        throw new DomainError('error.delete.unsafe', `拒绝删除：目标不是这一条技能的目录（${source}）`);
    }
}
/** 递归复制，遇到符号链接直接拒绝（导入不该变成一堆链接）。 */
export async function copyTree(source, destination) {
    const info = await lstat(source);
    if (info.isSymbolicLink())
        throw new DomainError('error.copy.symlink', `不复制符号链接：${source}`);
    if (info.isDirectory()) {
        await mkdir(destination, { recursive: true });
        for (const name of await readdir(source))
            await copyTree(join(source, name), join(destination, name));
        return;
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
}
