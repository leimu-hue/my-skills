/**
 * 编写一条技能：新建、编辑、读详情。
 *
 * 编辑的规矩来自 `frontmatter.ts`：只替换被点名要改的那几个键，其余字节原样保留 ——
 * 技能是用户的文件，不是我们的。
 */
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../../shared/result.js';
import { exists } from '../../shared/fs.js';
import { writeFileAtomic } from '../../shared/paths.js';
import { buildSkillFile, parseSkillFile, patchFrontmatter } from '../frontmatter.js';
import { assertRowWritable, assertSkillName, assertWritable, targetOf } from './guard.js';
/** 详情页最多列多少个文件：目录再大也不该把面板拖死。 */
const MAX_LISTED_FILES = 200;
export async function createSkill(root, input) {
    assertWritable(root);
    const name = input.name.trim();
    assertSkillName(name);
    const description = input.description.trim();
    if (description === '')
        throw new DomainError('error.description.required', '技能描述不能为空');
    const target = targetOf(root, name);
    if (await exists(target))
        throw new DomainError('error.skill.exists', `技能已存在：${root.label}/${name}`);
    const docPath = join(target, 'SKILL.md');
    await mkdir(target, { recursive: true });
    await writeFileAtomic(docPath, buildSkillFile({ name, description, whenToUse: input.whenToUse, body: input.body }));
    return { name, docPath };
}
export async function updateSkill(row, changes) {
    assertRowWritable(row);
    const original = await readFile(row.docPath, 'utf8').catch(() => {
        throw new DomainError('error.skill.unreadable', `读不出来：${row.docPath}`);
    });
    const parsed = parseSkillFile(original);
    if (!parsed.hasFrontmatter) {
        throw new DomainError('error.skill.noFrontmatter', `这个技能没有合法的 frontmatter，无法编辑：${row.name}`);
    }
    const patch = {};
    if (changes.description !== undefined)
        patch.description = changes.description.trim();
    if (changes.whenToUse !== undefined) {
        patch.whenToUse = changes.whenToUse.trim() === '' ? undefined : changes.whenToUse.trim();
    }
    const nextName = changes.name?.trim() ?? '';
    if (nextName !== '' && nextName !== row.declaredName) {
        assertSkillName(nextName);
        patch.name = nextName;
    }
    await writeFileAtomic(row.docPath, patchFrontmatter(parsed, patch, changes.body));
    return { docPath: row.docPath };
}
/**
 * 详情页要的三样东西（正文、文件清单、frontmatter）从**一次**读盘 + 一次解析里出。
 * 早先正文与 frontmatter 各读一遍同一个文件。
 */
export async function readSkillDetail(row) {
    const parsed = parseSkillFile(await readFile(row.docPath, 'utf8'));
    const files = row.form === 'bundle' ? await listBundleFiles(row.entryPath) : [`${row.name}.md`];
    return { body: parsed.body, files, frontmatter: parsed.data };
}
/** 一个 bundle 目录下的全部文件（相对路径）。 */
async function listBundleFiles(entryPath) {
    const files = [];
    const walk = async (directory, prefix) => {
        if (files.length >= MAX_LISTED_FILES)
            return;
        const dirents = await readdir(directory, { withFileTypes: true }).catch(() => []);
        for (const dirent of dirents) {
            if (dirent.name === '.git' || dirent.name === 'node_modules')
                continue;
            const rel = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`;
            if (dirent.isDirectory())
                await walk(join(directory, dirent.name), rel);
            else
                files.push(rel);
            if (files.length >= MAX_LISTED_FILES)
                return;
        }
    };
    await walk(entryPath, '');
    return files.sort();
}
