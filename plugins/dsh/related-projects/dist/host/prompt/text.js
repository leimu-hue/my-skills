export const SECTION_NAME = 'related-projects';
export const SECTION_ORDER = 900;
export const NOTICE_NAME = 'related-projects-changed';
export const NOTICE_ORDER = 910;
/**
 * 用一句话说清写边界；它来自沙箱策略。这里刻意不重复 workspace 根目录：
 * 会话的工作目录已经说明了这一点，而 `workspace-write` 本就受该目录约束。
 */
export function boundaryText(mode) {
    if (mode === null)
        return 'unknown';
    if (mode === 'danger-full-access')
        return 'danger-full-access (no path restriction)';
    if (mode === 'read-only')
        return 'read-only (no writes)';
    return 'workspace-write (writes outside the working directory need approval)';
}
function line(project) {
    const note = project.note === '' ? '' : ' — ' + project.note.replace(/\s+/g, ' ').trim();
    return '- ' + project.name + ' — ' + project.path + note;
}
function appendUnavailable(lines, unavailable) {
    if (unavailable.length === 0)
        return;
    lines.push('');
    lines.push(unavailable.length === 1
        ? '1 related project is unavailable (path missing); omitted — do not guess its content.'
        : String(unavailable.length) + ' related projects are unavailable (path missing); omitted — do not guess their content.');
}
/**
 * 会话的提示词小节：每个会话只渲染一次，随后冻结。
 *
 * 冻结是缓存上的决策，不是偷懒：该小节位于唯一的 system-prompt 节点内部，
 * 所以注册表一变就重新渲染，会重写那个节点，丢掉整段对话已缓存的前缀。
 * 变更改为以追加式通知的形式传递（见 sessions.ts）。
 *
 * 没有可用内容就返回空字符串——在一个什么都没配置的 workspace 里，每个会话
 * 都念一句 "0 related projects" 只是噪声。
 */
export function sectionText(registry, workspace, boundary) {
    const { present, missing } = registry.readable(workspace);
    if (present.length === 0)
        return '';
    const lines = [
        '## Related projects (' + String(present.length) + ')',
        '',
        'Sibling repositories that a change here usually touches. Treat them as in scope when the request '
            + 'plausibly involves them; read them directly instead of asking for a path.',
        '',
        'Write scope: ' + boundary + '.',
        '',
    ];
    for (const project of present)
        lines.push(line(project));
    appendUnavailable(lines, missing);
    return lines.join('\n');
}
/**
 * 当前列表的各行，不含小节里的说明文字和写边界。通知本身已有自己的引导语，
 * 而冻结的小节仍然带着那些说明，所以在每条通知里重复它们纯粹是
 * 每次请求的额外开销。
 */
export function listText(registry, workspace) {
    const { present, missing } = registry.readable(workspace);
    if (present.length === 0)
        return '';
    const lines = present.map(line);
    appendUnavailable(lines, missing);
    return lines.join('\n');
}
/**
 * 一次变更，作为追加进对话历史的快照。
 *
 * 它带着当前的列表，模型就不必猜冻结小节是否仍然成立；它还会说明哪里变了，
 * 于是一次 note 编辑也不会有歧义。文本是静态的：重复渲染得到完全相同的字符串，
 * 这正是它之后不会被重写（也不会被重复计费）的原因。
 */
export function changeNotice(summary, current) {
    const head = 'Related projects changed: ' + summary + '. ';
    if (current === '') {
        return head + 'No usable related projects remain; ignore every earlier list, including earlier notices.';
    }
    return head + 'Current list (supersedes the system prompt and earlier notices):\n\n' + current;
}
/**
 * 对一个必须判断自己那份冻结列表是否仍然成立的模型来说，"updated X" 毫无用处，
 * 所以要指出真正变动的字段——包括 note 文本在内。
 */
export function describeUpdate(before, after) {
    const parts = [];
    if (before.name !== after.name)
        parts.push('renamed "' + before.name + '" to "' + after.name + '"');
    if (before.note !== after.note) {
        parts.push(after.note === '' ? 'note cleared for ' + after.name : 'note for ' + after.name + ' is now "' + after.note + '"');
    }
    if (before.enabled !== after.enabled)
        parts.push(after.name + (after.enabled ? ' enabled' : ' disabled'));
    if (parts.length === 0)
        return 'updated ' + after.name;
    return parts.join('; ');
}
