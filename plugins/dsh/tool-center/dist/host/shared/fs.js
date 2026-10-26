/**
 * 文件系统探针：把「出错就当没有」的读法收成一处。
 *
 * 早先每个域各写一遍 `stat(x).then(() => true).catch(() => false)`（7 处）与
 * `readFile(x).catch(() => '')` / `.catch(() => null)`（6 处）。这类读法的语义
 * （来源目录还不存在是正常的）是统一的，所以只留一份。
 */
import { readFile, stat } from 'node:fs/promises';
/** `stat`，失败（不存在 / 无权限）一律 null。 */
export async function statOrNull(path) {
    return stat(path).catch(() => null);
}
/** 路径是否存在（文件或目录都算）。 */
export async function exists(path) {
    return (await statOrNull(path)) !== null;
}
export async function isFile(path) {
    return (await statOrNull(path))?.isFile() === true;
}
export async function isDirectory(path) {
    return (await statOrNull(path))?.isDirectory() === true;
}
/** 读文本，失败返回 null（「文件不在」与「读不了」在这里不必区分）。 */
export async function readTextOrNull(path) {
    return readFile(path, 'utf8').catch(() => null);
}
