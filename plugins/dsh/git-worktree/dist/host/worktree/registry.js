/**
 * 持久化：一份 JSON，一张表。
 *
 * 只存「本插件创建了什么」这一件事；Git 才是 worktree 的事实来源。任何记录
 * 在读取时都会重新校验形状，坏条目直接丢弃而不是让整份注册表失效。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { samePath } from "../shared/paths.js";
const EMPTY = { version: 1, worktrees: {} };
function isRecord(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const record = value;
    return typeof record.id === 'string' && record.id !== ''
        && typeof record.name === 'string' && record.name !== ''
        && typeof record.repository === 'string' && isAbsolute(record.repository)
        && typeof record.repositoryName === 'string'
        && typeof record.path === 'string' && isAbsolute(record.path)
        && typeof record.baseOid === 'string'
        && (record.baseBranch === null || typeof record.baseBranch === 'string')
        && (record.mode === 'branch' || record.mode === 'detached')
        && (record.branch === null || typeof record.branch === 'string')
        && typeof record.createdAt === 'number'
        && (record.workspaceId === null || typeof record.workspaceId === 'string');
}
export class WorktreeRegistry {
    file;
    constructor(file) {
        this.file = file;
    }
    read() {
        if (!existsSync(this.file))
            return { version: 1, worktrees: {} };
        try {
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            if (parsed.version !== 1 || parsed.worktrees === null || typeof parsed.worktrees !== 'object')
                return { ...EMPTY };
            const worktrees = {};
            for (const [id, value] of Object.entries(parsed.worktrees)) {
                if (isRecord(value) && value.id === id)
                    worktrees[id] = value;
            }
            return { version: 1, worktrees };
        }
        catch {
            /* 损坏的注册表按空表处理：Git 侧的真相比一份读不动的缓存重要。 */
            return { ...EMPTY };
        }
    }
    write(value) {
        mkdirSync(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
        try {
            renameSync(temporary, this.file);
        }
        catch {
            /* Windows 上偶发占用：退化为直接覆盖，仍是完整写入。 */
            writeFileSync(this.file, JSON.stringify(value, null, 2), { mode: 0o600 });
        }
    }
    list(repository) {
        const values = Object.values(this.read().worktrees);
        const filtered = repository === undefined ? values : values.filter((record) => samePath(record.repository, repository));
        return filtered.sort((left, right) => right.createdAt - left.createdAt);
    }
    find(id) {
        return this.read().worktrees[id];
    }
    findByName(repository, name) {
        return this.list(repository).find((record) => record.name === name);
    }
    add(record) {
        const value = this.read();
        value.worktrees[record.id] = record;
        this.write(value);
    }
    update(id, patch) {
        const value = this.read();
        const current = value.worktrees[id];
        if (current === undefined)
            return;
        value.worktrees[id] = { ...current, ...patch };
        this.write(value);
    }
    remove(id) {
        const value = this.read();
        if (value.worktrees[id] === undefined)
            return;
        delete value.worktrees[id];
        this.write(value);
    }
}
