/**
 * 关联项目内部的文件与目录，供输入框的 `@` 菜单使用。
 *
 * 自带的文件来源只能搜索 Agent 的工作目录——关联项目则是该工作区
 * *之外* 的同级目录，所以它的文件在那里
 * 根本不可见。
 *
 * 两个操作，对齐自带菜单的行为：
 *   search  — 按 NAME 匹配并排序；某个目录本身命中后，
 *             就不再列出它的后代：用户靠选中它来逐层进入
 *             （`drill`），与 "文件与文件夹" 完全一致。
 *   list    — 某个目录的直接子项，供上述逐层进入使用。
 *
 * 成本控制：每个项目一份索引（最多每分钟重建一次），每次按键都在内存里
 * 过滤；再加上硬上限，以及一份构建/依赖目录的跳过清单，
 * 这样庞大的检出就不会卡住菜单，也不会把它刷爆。
 */
import { readdirSync } from 'node:fs';
import { absoluteOf, isInside, relativeTo, workspaceKey } from '../shared/paths.js';
/** 内容永远不值得从菜单里搜索的目录。 */
const SKIP = new Set([
    'node_modules', '.git', '.hg', '.svn', '.idea', '.vscode', '.vs',
    'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage',
    '.next', '.nuxt', '.output', '.turbo', '.cache', '.parcel-cache',
    'venv', '.venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.gradle', '.mvn', 'vendor', 'Pods', 'DerivedData',
]);
const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 12;
const INDEX_TTL_MS = 60_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const indexes = new Map();
function build(projectPath) {
    const entries = [];
    const stack = [{ dir: projectPath, rel: '', depth: 0 }];
    let exhausted = false;
    while (stack.length > 0 && !exhausted) {
        const current = stack.pop();
        if (current === undefined)
            break;
        let dirents;
        try {
            dirents = readdirSync(current.dir, { withFileTypes: true });
        }
        catch {
            continue; /* 目录读不了：跳过，绝不让整个搜索失败 */
        }
        for (const dirent of dirents) {
            if (entries.length >= MAX_ENTRIES) {
                exhausted = true;
                break;
            }
            const name = dirent.name;
            const rel = current.rel === '' ? name : current.rel + '/' + name;
            if (dirent.isDirectory()) {
                if (SKIP.has(name))
                    continue;
                entries.push({ rel, name, kind: 'directory' });
                if (current.depth + 1 < MAX_DEPTH)
                    stack.push({ dir: absoluteOf(current.dir, name), rel, depth: current.depth + 1 });
                continue;
            }
            if (dirent.isFile())
                entries.push({ rel, name, kind: 'file' });
            /* 符号链接既不跟随（防止成环），也不列出。 */
        }
    }
    return { at: Date.now(), entries };
}
function indexOf(projectPath) {
    const key = workspaceKey(projectPath);
    const cached = indexes.get(key);
    if (cached !== undefined && Date.now() - cached.at < INDEX_TTL_MS)
        return cached;
    const built = build(projectPath);
    indexes.set(key, built);
    return built;
}
function hit(projectPath, entry, score) {
    return {
        path: absoluteOf(projectPath, entry.rel),
        rel: entry.rel,
        name: entry.name,
        kind: entry.kind,
        score,
    };
}
/**
 * 按 NAME 为输入的查询给条目排序。只看名字，不看相对路径：一次路径命中
 * 会把整棵子树拖进菜单，而逐层进入正是为此存在的。
 * 命中的目录会吞掉它的后代，所以 `需求开发` 只列出那一个
 * 目录，而不是它下面的所有东西。
 */
export function searchProjects(projects, query, limit) {
    const capped = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '');
    if (tokens.length === 0)
        return [];
    const merged = [];
    for (const project of projects) {
        const hits = [];
        const matchedDirs = [];
        for (const entry of indexOf(project.path).entries) {
            const name = entry.name.toLowerCase();
            let score = 0;
            let matched = true;
            for (const token of tokens) {
                const at = name.indexOf(token);
                if (at < 0) {
                    matched = false;
                    break;
                }
                /* 完全同名优于前缀匹配，前缀匹配优于子串匹配。 */
                score += name === token ? 1000 : (at === 0 ? 500 : 300);
            }
            if (matched !== true)
                continue;
            /* 命中目录之下更深层的条目属于该目录的内容：
               用户靠逐层进入到达那里，而不是读一份被摊平的清单。 */
            if (matchedDirs.some((dir) => entry.rel.startsWith(dir + '/')))
                continue;
            if (entry.kind === 'directory')
                matchedDirs.push(entry.rel);
            hits.push(hit(project.path, entry, score));
        }
        hits.sort((left, right) => right.score - left.score || left.rel.localeCompare(right.rel));
        merged.push(...hits.slice(0, capped));
    }
    merged.sort((left, right) => right.score - left.score || left.rel.localeCompare(right.rel));
    return merged.slice(0, capped).map(({ score: _score, ...row }) => row);
}
/**
 * 一个逐层进入的目标属于哪个项目，以及它在项目内的位置。越界规则
 * 只写在这一处：`list` 请求只能遍历已注册的关联项目，
 * 或该项目内部的目录，这样菜单就没法被用来
 * 按外部传入的路径浏览文件系统。
 */
export function directoryTarget(projects, dir) {
    for (const project of projects) {
        if (!isInside(project.path, dir))
            continue;
        const rel = relativeTo(project.path, dir);
        if (rel !== null)
            return { root: project, rel };
    }
    return null;
}
function kindOf(dirent) {
    if (dirent.isDirectory())
        return SKIP.has(dirent.name) ? null : 'directory';
    return dirent.isFile() ? 'file' : null;
}
/**
 * 项目内某个目录的直接子项，用于一次逐层进入。
 * `filter` 是最后一个 `/` 之后输入的文字：按子项 NAME 匹配，
 * 所以输入路径实际上是在收窄用户当前所在的这一层。
 *
 * `root` + `rel` 来自 `directoryTarget`，所以这个函数不必
 * 重新推导（或重新校验）越界规则。
 */
export function listDirectory(root, rel, filter, limit) {
    const capped = Math.min(Math.max(limit ?? MAX_LIMIT, 1), MAX_LIMIT);
    const target = absoluteOf(root.path, rel);
    let dirents;
    try {
        dirents = readdirSync(target, { withFileTypes: true });
    }
    catch {
        return { rows: [], truncated: false };
    }
    const needle = filter.toLowerCase();
    const ranked = [];
    for (const dirent of dirents) {
        const kind = kindOf(dirent);
        if (kind === null)
            continue;
        const name = dirent.name;
        /* 一个粗粒度的分数，让排序在 filter 为空（0 分，即平铺列出该层）
           或正在收窄时都能正常工作。 */
        let score = 0;
        if (needle !== '') {
            const at = name.toLowerCase().indexOf(needle);
            if (at < 0)
                continue;
            score = name.toLowerCase() === needle ? 1000 : (at === 0 ? 500 : 300);
        }
        const entry = { rel: rel === '' ? name : rel + '/' + name, name, kind };
        ranked.push({ ...hit(root.path, entry, score), dirFirst: kind === 'directory' ? 0 : 1 });
    }
    /* 目录在前（平铺列出一层就该是这个样子），再按名字排序。 */
    ranked.sort((left, right) => right.score - left.score || left.dirFirst - right.dirFirst || left.name.localeCompare(right.name));
    const rows = ranked.slice(0, capped).map(({ score: _score, dirFirst: _dirFirst, ...row }) => row);
    return { rows, truncated: ranked.length > capped };
}
