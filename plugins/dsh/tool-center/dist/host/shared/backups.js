/**
 * 备份一件事：写一份带时间戳的副本，并只保留最近 N 份。
 *
 * 原本提示词（AGENTS.md）与 MCP（cordis.patch.yml）各写了一遍同样的「mkdir → 时间戳 →
 * 写 → 列目录 → 删旧的」，收成一处。提示词改成追加系统提示词、不再写用户文件之后，实际
 * 只剩 MCP 的 patch 在用；形状是通用的，所以留在 shared/。
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from "./paths.js";
/** 时间戳做文件名：去掉 `:` 与 `.`（Windows 不允许）。 */
function backupStamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}
export async function writeBackup(options) {
    await mkdir(options.dir, { recursive: true });
    const stamp = backupStamp();
    const fileName = `${options.baseName}-${stamp}`;
    const target = join(options.dir, fileName);
    if (options.atomic === false)
        await writeFile(target, options.content, { mode: 0o600 });
    else
        await writeFileAtomic(target, options.content);
    const prefix = options.prunePrefix ?? options.baseName;
    const names = (await readdir(options.dir).catch(() => []))
        .filter((name) => name.startsWith(prefix))
        .sort();
    // 刚写下的那一份永远不参与淘汰：时间戳排序在跨版本旧文件名上不一定可靠。
    const candidates = names.filter((name) => name !== fileName);
    for (const stale of candidates.slice(0, Math.max(0, names.length - options.keep))) {
        await rm(join(options.dir, stale), { force: true }).catch(() => undefined);
    }
    return { fileName, stamp };
}
