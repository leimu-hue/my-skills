import { compareRows, groupRows, rowOf } from './policy.js';
export async function buildStateView(input) {
    const started = Date.now();
    const removed = new Set(input.state.removedSources);
    const warnings = [...(input.warnings ?? [])];
    const scans = await Promise.all(input.roots.map(async (root) => {
        if (removed.has(root.key))
            return { root, rows: [], error: undefined, truncated: false };
        const scan = await input.scanner.scan(root);
        const rows = scan.entries.map((entry) => rowOf({ root, entry }, input.state, input.scopeKey));
        return { root, rows, error: scan.error, truncated: scan.truncated === true };
    }));
    // 同名归属必须跨来源一次裁决完，之后才谈每行是否可见。
    const allRows = scans.flatMap((scan) => scan.rows);
    groupRows(allRows);
    let enabled = 0;
    let disabled = 0;
    let shadowed = 0;
    const rootViews = [];
    for (const scan of scans) {
        const rows = scan.rows.sort(compareRows);
        for (const row of rows) {
            if (row.shadowed)
                shadowed += 1;
            else if (row.policy.modelInvocable)
                enabled += 1;
            else
                disabled += 1;
        }
        rootViews.push({
            key: scan.root.key,
            path: scan.root.path,
            label: scan.root.label,
            rank: scan.root.rank,
            kind: scan.root.kind,
            writable: scan.root.writable,
            toggleable: scan.root.toggleable,
            project: scan.root.project === true,
            hostScans: scan.root.hostScans,
            enabled: !removed.has(scan.root.key)
                && (scan.root.project === true || input.state.sources[scan.root.key] !== false),
            removed: removed.has(scan.root.key),
            skills: rows,
            error: scan.error,
            truncated: scan.truncated === true ? true : undefined,
        });
        if (scan.error !== undefined)
            warnings.push(`${scan.root.label}：${scan.error}`);
        if (scan.truncated)
            warnings.push(`${scan.root.label}：目录过多，只列出了前一部分`);
    }
    rootViews.sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));
    return {
        roots: rootViews,
        counts: {
            total: allRows.length,
            enabled,
            disabled,
            shadowed,
            sources: rootViews.filter((root) => !root.removed).length,
        },
        warnings,
        scopeKey: input.scopeKey ?? '',
        generation: input.scanner.generation(),
        durationMs: Date.now() - started,
        stateHealthy: input.stateHealthy !== false,
    };
}
/**
 * 当前扫描的「来源键 → 现存的名字（目录名与声明名）」，用于剪掉已不存在技能的策略条目
 * （审计 B5：被替换的插件从不清理，于是删除再重建同名技能会继承旧开关）。
 */
export function liveNameIndex(view) {
    const index = new Map();
    for (const root of view.roots) {
        if (root.removed)
            continue;
        const names = new Set();
        for (const row of root.skills) {
            names.add(row.name);
            names.add(row.declaredName);
        }
        index.set(root.key, names);
    }
    return index;
}
/** 打平的行列表，给 provider 与工具用。 */
export function allRows(view) {
    const rows = [];
    for (const root of view.roots)
        rows.push(...root.skills);
    return rows;
}
