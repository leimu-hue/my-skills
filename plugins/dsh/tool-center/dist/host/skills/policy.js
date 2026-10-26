import { preferredRootOf, skillSwitchOf, sourceSwitchOf } from './state.js';
/** 一行的稳定标识（去重与场景白名单都用它）。 */
export function rowIdOf(rootKey, name) {
    return rootKey + '\u0000' + name;
}
/** 这一行是否就是某个引用（`root` 省略 = 任意来源，按声明名或目录名匹配）。 */
export function rowMatchesRef(row, ref) {
    if (typeof ref.root === 'string' && ref.root !== '' && row.rootKey !== ref.root)
        return false;
    return row.name === ref.name || row.declaredName === ref.name;
}
/** 只收形状正确的技能引用（op 参数与场景白名单共用同一个形状校验）。 */
export function skillRefsOf(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => item !== null && typeof item === 'object'
        && typeof item.root === 'string' && typeof item.name === 'string')
        .map((item) => ({ root: item.root, name: item.name }));
}
/** 为一条技能构造行（策略 + 是否被钉住）。 */
export function rowOf(ref, state, scopeKey) {
    return {
        rootKey: ref.root.key,
        rootLabel: ref.root.label,
        rootRank: ref.root.rank,
        rootKind: ref.root.kind,
        rootWritable: ref.root.writable,
        name: ref.entry.name,
        declaredName: ref.entry.declaredName,
        description: ref.entry.description,
        whenToUse: ref.entry.whenToUse,
        docPath: ref.entry.docPath,
        entryPath: ref.entry.entryPath,
        form: ref.entry.form,
        loadable: ref.entry.loadable,
        problem: ref.entry.problem,
        linked: ref.entry.linked,
        nested: ref.entry.nested,
        declaresModelInvocable: ref.entry.declaresModelInvocable,
        declaresUserInvocable: ref.entry.declaresUserInvocable,
        policy: policyOf(ref, state, scopeKey),
        preferred: preferredRootOf(state, ref.entry.declaredName, scopeKey) === ref.root.key,
        // 临时值；`groupRows` 会按整个同名组重新裁决。
        overlayRank: ref.root.rank - 1,
        shadowed: false,
        winner: true,
    };
}
/** 一条技能在当前层下最终生效的开关。 */
export function policyOf(ref, state, scopeKey) {
    const removed = state.removedSources.includes(ref.root.key);
    // 项目来源不能整体启停：它存在与否由会话 cwd 决定。报一个我们兑现不了的开关就是撒谎。
    const rootOn = ref.root.project === true ? !removed : !removed && sourceSwitchOf(state, ref.root.key, scopeKey);
    const skillOn = skillSwitchOf(state, ref.root.key, ref.entry.name, scopeKey);
    return {
        rootOn,
        skillOn,
        modelInvocable: rootOn && skillOn && ref.entry.loadable && ref.entry.declaresModelInvocable,
        userInvocable: rootOn && skillOn && ref.entry.loadable && ref.entry.declaresUserInvocable,
    };
}
/**
 * 按声明名分组，并标出落选者。
 *
 * 被停用的赢家**仍然**遮蔽它下面的副本（被替换的插件也依赖同一条不变式）：
 * 如果因为用户关掉了赢家就让低优先级副本浮上来，「关掉」就变成了「换个地方开着」。
 */
export function groupRows(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = row.declaredName || row.name;
        const list = groups.get(key);
        if (list === undefined)
            groups.set(key, [row]);
        else
            list.push(row);
    }
    for (const list of groups.values()) {
        // 覆盖 rank 由**组内最优 rank** 决定：我们的赢家候选必须压过所有竞争者，包括宿主
        // 自己发布的、属于组内最低 rank 来源的那一条 —— 这正是「设为首选」能生效的原因。
        const bestRank = Math.min(...list.map((row) => row.rootRank));
        const overlayRank = bestRank - 1;
        if (list.length === 1) {
            const only = list[0];
            only.winner = true;
            only.shadowed = false;
            only.overlayRank = overlayRank;
            continue;
        }
        list.sort((left, right) => {
            if (left.preferred !== right.preferred)
                return left.preferred ? -1 : 1;
            if (left.rootRank !== right.rootRank)
                return left.rootRank - right.rootRank;
            return left.rootKey.localeCompare(right.rootKey);
        });
        const winner = list[0];
        winner.winner = true;
        winner.shadowed = false;
        winner.overlayRank = overlayRank;
        delete winner.shadowedBy;
        for (const loser of list.slice(1)) {
            loser.winner = false;
            loser.shadowed = true;
            // 永不发布：赢家候选已经压过落选者那些来源上的宿主条目，再给影子副本发候选
            // 只会给目录添噪声。
            loser.overlayRank = overlayRank;
            loser.shadowedBy = { rootKey: winner.rootKey, rootLabel: winner.rootLabel, path: winner.entryPath };
        }
    }
    return rows;
}
/** 面板顺序：赢家在前，然后按声明名，再按 rank。 */
export function compareRows(left, right) {
    if (left.shadowed !== right.shadowed)
        return left.shadowed ? 1 : -1;
    const byName = left.declaredName.localeCompare(right.declaredName);
    if (byName !== 0)
        return byName;
    return left.rootRank - right.rootRank;
}
/**
 * 这一行是否需要我们发一条 provider 候选。
 *
 * 宿主自己的 filesystem provider 已经在发布它认识的那些来源里的顶层技能。除非我们真的
 * 要改变答案，否则必须让开 —— 不然每条技能都会被发布两次，目录里出现重复（我们自己的
 * `get` 也会去重读宿主本可以供给的正文）。
 *
 * 我们会插手的场合：
 *   * 来源或这条技能被关掉了（宿主仍然会发布它）；
 *   * 条目结构不完整（它的问题不该传到模型那里）；
 *   * 宿主根本不扫这个来源（`hostScans === false`）；
 *   * 条目比宿主的发现更深（嵌套）；
 *   * 用户把这个名字钉在了这个来源上（钉子必须能把赢家挪过去）。
 *
 * 被遮蔽的行到不了这里：它们在进入本判断之前就被丢掉，因为赢家候选的 rank 已经压过
 * 它们所在来源的宿主条目。
 */
export function needsOverlay(row, hostScans) {
    if (row.shadowed)
        return false;
    if (!row.policy.rootOn || !row.policy.skillOn)
        return true;
    if (!row.loadable)
        return true;
    if (!hostScans)
        return true;
    if (row.nested)
        return true;
    if (row.preferred)
        return true;
    return false;
}
/** 这一行是否应该出现在模型面前。 */
export function modelVisible(row) {
    return row.winner && row.policy.modelInvocable;
}
/** 这一行是否应该出现在人工命令目录里。 */
export function userVisible(row) {
    return row.winner && row.policy.userInvocable;
}
