/**
 * 唯一的状态文档。
 *
 * 下面每一条设计决定，都是对被替换插件的刻意偏离
 * （对比被替换的那个插件）：
 *
 *   * **一个文件。** 策略、自定义目录、rank 全在一份 JSON 里，所以一次原子写就是一次
 *     一致变更。没有意图侧车，没有第二把锁，也没有两个文件之间的对账循环。
 *   * **永不 fail-closed。** 文件坏了就备份、退回默认值并带上 `degraded` 标记；面板照常
 *     能用，写操作也照样可用。因为一个字节不对就把所有技能关掉、界面一个开关都按不动，
 *     比「从默认值开始 + 一条看得见的告警」糟得多。
 *   * **幂等写入。** `saveState` 只由「已经确认有变化」的那次变更调用；本插件每个调用方
 *     都在「请求值等于当前值」时提前返回。
 *   * **分层作用域从第一天就是接口。** 所有策略读取都走 `resolveLayer()`；v0.1 从不写
 *     layers，但将来写进去时，下游一行都不用改。
 */
import { readFile, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { isInside, pathId, pathKey, writeFileAtomic } from "../shared/paths.js";
import { isRecord } from "../shared/json.js";
const STATE_VERSION = 1;
export function defaultState() {
    return {
        version: STATE_VERSION,
        sources: {},
        removedSources: [],
        hiddenSkills: {},
        preferredSkills: {},
        customRoots: [],
        ranks: {},
        layers: { sessions: {}, workspaces: {} },
    };
}
export function defaultStatePath(dshHome) {
    return join(dshHome, 'tool-center', 'state.json');
}
const CUSTOM_KEY = /^custom-[a-f0-9]{16}$/;
/** 读文档，什么都容忍。坏文件只备份一次。 */
export async function loadState(file) {
    let text;
    try {
        text = await readFile(file, 'utf8');
    }
    catch (cause) {
        const code = cause.code;
        if (code === 'ENOENT')
            return { state: defaultState(), origin: 'default', warnings: [], degraded: false };
        return {
            state: defaultState(),
            origin: 'default',
            warnings: [`状态文件读不出来（${String(cause.message ?? cause)}），已按默认值继续`],
            degraded: true,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (cause) {
        const backup = `${file}.corrupt-${Date.now().toString(36)}`;
        await rename(file, backup).catch(() => undefined);
        void cause;
        return {
            state: defaultState(),
            origin: 'recovered',
            warnings: [`状态文件不是合法 JSON（已备份到 ${backup}），本次按默认值继续`],
            degraded: true,
        };
    }
    const normalized = normalizeState(parsed);
    return {
        state: normalized.state,
        origin: normalized.warnings.length === 0 ? 'file' : 'recovered',
        warnings: normalized.warnings,
        degraded: normalized.warnings.length > 0,
    };
}
/**
 * 认识的就收下，不认识的就丢掉并说明原因。
 *
 * 被替换的插件把任何意外形状都当致命错误（所有东西 `writable:false`）。这里未知字段
 * 丢一条告警就过去，文档其余部分照样保留：一个能向前兼容的读取方，比严格更值钱。
 */
export function normalizeState(value) {
    const warnings = [];
    const state = defaultState();
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { state, warnings: ['状态文件不是对象，已按默认值继续'] };
    }
    const record = value;
    if (record.version !== undefined && record.version !== STATE_VERSION) {
        warnings.push(`状态文件版本是 ${String(record.version)}，按 v${STATE_VERSION} 读取`);
    }
    if (record.sources !== undefined) {
        if (isRecord(record.sources)) {
            for (const [key, flag] of Object.entries(record.sources)) {
                if (typeof flag === 'boolean' && key !== '')
                    state.sources[key] = flag;
            }
        }
        else {
            warnings.push('sources 字段不是对象，已忽略');
        }
    }
    if (Array.isArray(record.removedSources)) {
        state.removedSources = uniqueStrings(record.removedSources);
    }
    else if (record.removedSources !== undefined) {
        warnings.push('removedSources 字段不是数组，已忽略');
    }
    if (isRecord(record.hiddenSkills)) {
        for (const [key, names] of Object.entries(record.hiddenSkills)) {
            if (key === '' || !Array.isArray(names))
                continue;
            const clean = uniqueStrings(names);
            if (clean.length > 0)
                state.hiddenSkills[key] = clean;
        }
    }
    else if (record.hiddenSkills !== undefined) {
        warnings.push('hiddenSkills 字段不是对象，已忽略');
    }
    if (isRecord(record.preferredSkills)) {
        for (const [name, rootKey] of Object.entries(record.preferredSkills)) {
            if (name !== '' && typeof rootKey === 'string' && rootKey !== '')
                state.preferredSkills[name] = rootKey;
        }
    }
    else if (record.preferredSkills !== undefined) {
        warnings.push('preferredSkills 字段不是对象，已忽略');
    }
    if (Array.isArray(record.customRoots)) {
        const seen = new Set();
        for (const item of record.customRoots) {
            if (!isRecord(item))
                continue;
            const path = typeof item.path === 'string' ? item.path : '';
            const key = typeof item.key === 'string' ? item.key : '';
            if (path === '' || !isAbsolute(path) || !CUSTOM_KEY.test(key) || seen.has(key)) {
                warnings.push(`自定义目录记录无效，已忽略：${key || path || '(空)'}`);
                continue;
            }
            seen.add(key);
            state.customRoots.push({
                key,
                path,
                label: typeof item.label === 'string' && item.label !== '' ? item.label : '自定义目录',
                rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : 600,
            });
        }
    }
    if (isRecord(record.ranks)) {
        for (const [key, rank] of Object.entries(record.ranks)) {
            if (key !== '' && typeof rank === 'number' && Number.isFinite(rank))
                state.ranks[key] = rank;
        }
    }
    if (isRecord(record.layers)) {
        state.layers = {
            sessions: layersOf(record.layers.sessions),
            workspaces: layersOf(record.layers.workspaces),
        };
    }
    return { state, warnings };
}
function layersOf(value) {
    const out = {};
    if (!isRecord(value))
        return out;
    for (const [key, layer] of Object.entries(value)) {
        if (key === '' || !isRecord(layer))
            continue;
        const clean = {};
        if (isRecord(layer.sources)) {
            const sources = {};
            for (const [rootKey, flag] of Object.entries(layer.sources)) {
                if (typeof flag === 'boolean')
                    sources[rootKey] = flag;
            }
            clean.sources = sources;
        }
        if (isRecord(layer.hiddenSkills)) {
            const hidden = {};
            for (const [rootKey, names] of Object.entries(layer.hiddenSkills)) {
                if (Array.isArray(names))
                    hidden[rootKey] = uniqueStrings(names);
            }
            clean.hiddenSkills = hidden;
        }
        if (isRecord(layer.enabledSkills)) {
            const enabled = {};
            for (const [rootKey, names] of Object.entries(layer.enabledSkills)) {
                if (Array.isArray(names))
                    enabled[rootKey] = uniqueStrings(names);
            }
            clean.enabledSkills = enabled;
        }
        if (layer.whitelist === true)
            clean.whitelist = true;
        if (isRecord(layer.preferredSkills)) {
            const preferred = {};
            for (const [name, rootKey] of Object.entries(layer.preferredSkills)) {
                if (typeof rootKey === 'string' && rootKey !== '')
                    preferred[name] = rootKey;
            }
            clean.preferredSkills = preferred;
        }
        out[key] = clean;
    }
    return out;
}
export function saveState(file, state) {
    return writeFileAtomic(file, JSON.stringify(state, null, 2) + '\n');
}
/**
 * 一个作用域的覆盖只从这里查。
 *
 * 两种作用域键：`ws:<工作区绝对路径>`（该工作区**默认**用哪个场景）与
 * `ss:<根会话 id>`（这个会话自己的选择）。会话比工作区更近，所以 `ss:` 直接返回会话层
 * —— 会话层是**整层替代**而不是叠加：会话选了「不用」时，工作区的层不该再漏进来。
 */
export function resolveLayer(state, scopeKey) {
    if (typeof scopeKey !== 'string' || scopeKey === '')
        return undefined;
    if (scopeKey.startsWith('ss:'))
        return state.layers.sessions[scopeKey.slice(3)];
    if (scopeKey.startsWith('ws:'))
        return state.layers.workspaces[scopeKey.slice(3)];
    // 旧形状：直接给会话 id。
    return state.layers.sessions[scopeKey];
}
/**
 * 由会话 cwd 找出它落在哪个工作区层里。
 *
 * 取**最深**的那一层：`D:\repo` 与 `D:\repo\sub` 上都可能绑了场景，子目录应当命中最深的那个。
 * 判定与比较都走 `shared/paths.ts` 的同一个口径（`isInside` / `pathKey`）—— 大小写、分隔符、
 * `..` 这些事只在一个地方决定，否则「技能按 A 项目隔离、场景却命中了 B」。
 */
export function workspaceScopeOf(state, cwd) {
    if (typeof cwd !== 'string' || cwd.trim() === '')
        return undefined;
    let best;
    for (const key of Object.keys(state.layers.workspaces)) {
        if (!isInside(key, cwd))
            continue;
        if (best === undefined || pathKey(key).length > pathKey(best).length)
            best = key;
    }
    return best === undefined ? undefined : `ws:${best}`;
}
/** 某条技能最终生效的单条开关（分层感知）。 */
export function skillSwitchOf(state, rootKey, name, scopeKey) {
    const layer = resolveLayer(state, scopeKey);
    // 白名单作用域只留列出来的那些：没列出来的（包括之后才装的技能）都不算这个场景的一部分。
    if (layer?.whitelist === true) {
        const listed = layer.enabledSkills?.[rootKey];
        return Array.isArray(listed) && listed.includes(name);
    }
    // 正向覆盖先生效：场景允许「在这个工作区用一条平时关着的技能」。
    const layerEnabled = layer?.enabledSkills?.[rootKey];
    if (Array.isArray(layerEnabled) && layerEnabled.includes(name))
        return true;
    const layerHidden = layer?.hiddenSkills?.[rootKey];
    if (Array.isArray(layerHidden) && layerHidden.includes(name))
        return false;
    const hidden = state.hiddenSkills[rootKey];
    return !(Array.isArray(hidden) && hidden.includes(name));
}
/** 某个来源最终生效的闸门（分层感知）。 */
export function sourceSwitchOf(state, rootKey, scopeKey) {
    const layer = resolveLayer(state, scopeKey);
    const layered = layer?.sources?.[rootKey];
    if (typeof layered === 'boolean')
        return layered;
    const flag = state.sources[rootKey];
    return flag !== false;
}
/** 某个声明名最终生效的首选来源（分层感知）。 */
export function preferredRootOf(state, name, scopeKey) {
    const layer = resolveLayer(state, scopeKey);
    const layered = layer?.preferredSkills?.[name];
    if (typeof layered === 'string' && layered !== '')
        return layered;
    return state.preferredSkills[name];
}
/** 把一个技能名从所有策略表里清掉（删除 / 移动时用）。 */
export function forgetSkillEverywhere(state, rootKey, name) {
    let changed = false;
    const hidden = state.hiddenSkills[rootKey];
    if (Array.isArray(hidden) && hidden.includes(name)) {
        const next = hidden.filter((item) => item !== name);
        if (next.length === 0)
            delete state.hiddenSkills[rootKey];
        else
            state.hiddenSkills[rootKey] = next;
        changed = true;
    }
    if (state.preferredSkills[name] === rootKey) {
        delete state.preferredSkills[name];
        changed = true;
    }
    for (const layer of Object.values(state.layers.sessions).concat(Object.values(state.layers.workspaces))) {
        const layerHidden = layer.hiddenSkills?.[rootKey];
        if (Array.isArray(layerHidden) && layerHidden.includes(name)) {
            layer.hiddenSkills[rootKey] = layerHidden.filter((item) => item !== name);
            changed = true;
        }
        const layerEnabled = layer.enabledSkills?.[rootKey];
        if (Array.isArray(layerEnabled) && layerEnabled.includes(name)) {
            layer.enabledSkills[rootKey] = layerEnabled.filter((item) => item !== name);
            changed = true;
        }
        if (layer.preferredSkills?.[name] === rootKey) {
            delete layer.preferredSkills[name];
            changed = true;
        }
    }
    return changed;
}
/**
 * 丢掉那些已经对不上磁盘的策略条目。
 *
 * 被替换的插件把已删除技能的名字永远留在策略表里，于是「删掉再建同名技能」会静默继承
 * 上一次的开关。`live` 是本次扫描：来源键 → 条目名集合。
 */
export function pruneState(state, live) {
    const dropped = [];
    let changed = false;
    for (const [rootKey, names] of Object.entries(state.hiddenSkills)) {
        const known = live.get(rootKey);
        // 这一轮没扫到的来源（不存在 / 已移除）不动：它的策略必须能扛过「移动硬盘拔了」
        // 或「项目没打开」。
        if (known === undefined)
            continue;
        const kept = names.filter((name) => known.has(name));
        if (kept.length !== names.length) {
            changed = true;
            for (const name of names)
                if (!known.has(name))
                    dropped.push(`hidden:${rootKey}/${name}`);
            if (kept.length === 0)
                delete state.hiddenSkills[rootKey];
            else
                state.hiddenSkills[rootKey] = kept;
        }
    }
    for (const [name, rootKey] of Object.entries(state.preferredSkills)) {
        const rootExists = live.has(rootKey);
        const known = live.get(rootKey);
        // 来源这一轮没被扫（项目没打开）时保留这个钉；来源扫了但技能没了才丢。
        if (!rootExists)
            continue;
        if (known !== undefined && !known.has(name)) {
            delete state.preferredSkills[name];
            dropped.push(`preferred:${name}`);
            changed = true;
        }
    }
    return { changed, dropped };
}
export function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (typeof value !== 'string')
            continue;
        const trimmed = value.trim();
        if (trimmed === '' || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out.sort();
}
/** 由绝对路径派生自定义来源的键（跨次运行稳定）。 */
export async function customRootKey(path) {
    const id = await pathId(path);
    let hash = 0x811c9dc5;
    for (let index = 0; index < id.length; index += 1) {
        hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
    }
    // 用两个不同质数各跑一轮，凑出 16 位十六进制的键空间。
    let hash2 = 0x9dc5811c;
    for (let index = id.length - 1; index >= 0; index -= 1) {
        hash2 = Math.imul(hash2 ^ id.charCodeAt(index), 0x85ebca6b) >>> 0;
    }
    const key = `custom-${hash.toString(16).padStart(8, '0')}${hash2.toString(16).padStart(8, '0')}`;
    return key.slice(0, `custom-`.length + 16);
}
export function customRootOf(state, key) {
    return state.customRoots.find((root) => root.key === key);
}
