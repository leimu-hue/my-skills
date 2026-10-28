/**
 * Host 半侧的路径身份：这里每个对外契约（工作区路径、项目路径、工具的 `path`
 * 参数）都要求「完整限定路径」。
 */
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
const DATA_FILE_NAME = 'related-projects.json';
/** DSH 数据目录：`$DSH_HOME`，否则 `~/.dsh`。 */
export function defaultDataFile() {
    const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
        ? process.env.DSH_HOME
        : join(homedir(), '.dsh');
    return join(home, DATA_FILE_NAME);
}
/**
 * 去掉末尾分隔符的绝对路径。
 *
 * 相对写法直接拒绝，而不是拿 Host 进程的 cwd 去解析：悄悄选中另一个目录，
 * 比显式失败更糟。
 */
export function normalizePath(input) {
    const text = String(input ?? '').trim();
    if (text === '' || !isAbsolute(text))
        return '';
    /* Windows 还把 `\foo` 和 `/foo` 也叫绝对路径（以当前驱动器为根），
       那同样不算完整限定写法。`\\server\share` 则保留。 */
    if (process.platform === 'win32' && /^[\\/](?![\\/])/.test(text))
        return '';
    let resolved;
    try {
        resolved = resolve(text);
    }
    catch {
        return '';
    }
    /* 裸根（`/`、`D:\`）原样保留；只有更长的路径才会失去末尾分隔符。 */
    return resolved.length > parse(resolved).root.length ? resolved.replace(/[\\/]+$/, '') : resolved;
}
/** 分组键：Windows 路径折叠大小写，所有路径折叠分隔符。 */
export function workspaceKey(input) {
    const normalized = normalizePath(input);
    if (normalized === '')
        return '';
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
/** 用 `/` 写法的路径，去掉末尾斜杠 —— 供相对比较使用。 */
function slashPath(input) {
    return String(input ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
}
/** 任一种写法下路径的最后一段。 */
export function basename(path) {
    const parts = slashPath(path).split('/').filter((part) => part !== '');
    const last = parts[parts.length - 1];
    return last === undefined ? path : last;
}
export function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
export function isDriveRoot(path) {
    const root = parse(path).root;
    return path !== '' && slashPath(root) === slashPath(path);
}
export function isHome(path) {
    return path !== '' && workspaceKey(path) === workspaceKey(homedir());
}
/** `root` 下 `rel`（`/` 分隔的相对路径）对应的绝对路径。 */
export function absoluteOf(root, rel) {
    return rel === '' ? root : root + sep + rel.split('/').join(sep);
}
/**
 * 用于比较的统一写法：`/` 分隔，且只在文件系统本身也折叠大小写时才折叠。
 * 无条件折叠会把 `/a/Proj` 和 `/a/proj` 在 POSIX 上当成同一个目录 —— 而它们不是。
 */
function comparable(path) {
    const text = slashPath(path);
    return process.platform === 'win32' ? text.toLowerCase() : text;
}
/** `target` 是 `root` 本身，还是位于其下。 */
export function isInside(root, target) {
    const base = comparable(root);
    const candidate = comparable(target);
    return candidate === base || candidate.startsWith(base + '/');
}
/** `target` 相对 `root` 的 `rel`（root 本身为 ''，在外则为 null）。 */
export function relativeTo(root, target) {
    if (!isInside(root, target))
        return null;
    const base = slashPath(root);
    const candidate = slashPath(target);
    if (candidate.length === base.length)
        return '';
    return candidate.slice(base.length + 1);
}
