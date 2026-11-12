/**
 * 路径规范化、名称校验、检出布局。
 *
 * 布局是显式的，因为它决定「用户和外部工具能不能看见这个 checkout」：
 *
 *   repo   <仓库>/.worktrees/<name>                       检出与仓库同目录，外部工具容易发现
 *   state  $DSH_HOME/git-worktree/worktrees/<key>/<name>   检出放在插件状态目录，不污染仓库
 *
 * 两种布局的目标目录都必须落在算出来的根目录之内；名字与目录名都不接受穿越。
 */
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DomainError } from "./errors.js";
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** 仓库内布局的默认目录名。 */
export const DEFAULT_WORKTREE_DIR = '.worktrees';
/** 默认分支前缀；面板可以覆盖它（存在状态目录的 settings.json 里）。 */
export const DEFAULT_BRANCH_PREFIX = 'worktree/';
/** Windows 上大小写不敏感；其他平台按字面比较。 */
export function samePath(left, right) {
    const a = resolve(left);
    const b = resolve(right);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
/** worktree 名：既做目录名，也做展示名。 */
export function validateName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name === '' || name.length > 64 || !NAME.test(name) || WINDOWS_RESERVED.test(name) || name.endsWith('.')) {
        /* 带上规则与违规值：只说一个错误码，调用方（包括模型）无法自救。 */
        throw new DomainError('invalid-name', `invalid worktree name ${JSON.stringify(name)}: expected [A-Za-z0-9][A-Za-z0-9._-]{0,63}, `
            + 'no trailing dot, no Windows reserved name');
    }
    return name;
}
/**
 * 仓库内目录名：单段相对路径，不接受绝对路径、盘符、`..` 与结尾斜杠。
 * 允许 `.worktrees` 这种隐藏名（首字符不是字母数字）。
 */
export function normalizeWorktreeDir(value) {
    const raw = typeof value === 'string' ? value.trim().replace(/[\\/]+$/, '') : '';
    if (raw === '' || raw.length > 64)
        throw new DomainError('invalid-layout', 'the worktree directory must be a single relative path');
    if (isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
        throw new DomainError('invalid-layout', 'the worktree directory must be relative to the repository');
    }
    const parts = raw.split(/[\\/]/);
    if (parts.some((part) => part === '' || part === '.' || part === '..')) {
        throw new DomainError('invalid-layout', 'the worktree directory cannot contain "." or ".." segments');
    }
    return parts.join('/');
}
/**
 * 仓库键：目录名 + 路径哈希前缀。只用 ASCII 安全字符，因为它是目录名；
 * 纯中文目录名清洗后为空时完全退回哈希。
 */
export function repositoryKey(root) {
    const readable = basename(root).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    const digest = createHash('sha256').update(process.platform === 'win32' ? root.toLowerCase() : root).digest('hex').slice(0, 10);
    return readable === '' ? digest : readable + '-' + digest;
}
/** 某个仓库的检出根目录；`base` 只在 state 布局下用到。 */
export function worktreesRoot(base, repository, layout, directory) {
    return layout === 'repo'
        ? join(repository, directory)
        : join(base, 'worktrees', repositoryKey(repository));
}
export function worktreePath(base, repository, layout, directory, name) {
    return join(worktreesRoot(base, repository, layout, directory), name);
}
/**
 * 分支名：前缀 + 名字。前缀是面板里可改的设置（默认 `worktree/`），空串表示
 * 直接用名字。合法性由 Host 用 `git check-ref-format` 校验，这里不重复实现规则。
 */
export function branchNameFor(name, prefix = DEFAULT_BRANCH_PREFIX) {
    return prefix + name;
}
/** 外部检出的稳定 id：路径就是身份，重命名等于换一个。 */
export function externalId(path) {
    const digest = createHash('sha256').update(process.platform === 'win32' ? path.toLowerCase() : path).digest('hex').slice(0, 16);
    return 'external:' + digest;
}
/** 目标必须落在给定根目录之内（防 `..` 与盘符逃逸）。 */
export function isInside(parent, child) {
    const rel = relative(resolve(parent), resolve(child));
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.includes(sep + '..');
}
