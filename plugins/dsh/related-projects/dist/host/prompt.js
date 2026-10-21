export const SECTION_NAME = 'related-projects';
export const SECTION_ORDER = 900;
export const NOTICE_NAME = 'related-projects-changed';
export const NOTICE_ORDER = 910;
/** The write boundary as one clause; it comes from the live sandbox policy. */
export function boundaryText(fact) {
    if (fact === null)
        return 'unknown';
    if (fact.mode === 'danger-full-access')
        return 'danger-full-access (no path restriction)';
    if (fact.mode === 'read-only')
        return 'read-only (no writes)';
    return 'workspace-write (only ' + fact.workspaceRoot + ' is writable; writes elsewhere need approval)';
}
/**
 * The session's prompt section, rendered ONCE per session and then frozen.
 *
 * Freezing is a cache decision, not laziness: the section lives inside the single
 * system-prompt node, so re-rendering it after any registry change would rewrite
 * that node and throw away the cached prefix for the whole conversation. Changes
 * travel as append-only notices instead (see sessions.ts).
 *
 * Nothing usable means an empty string — a section announcing "0 related
 * projects" is noise in every session of every unconfigured workspace.
 */
export function sectionText(registry, workspace, boundary) {
    const snapshot = registry.snapshot(workspace);
    const usable = snapshot.projects.filter((project) => project.enabled !== false && project.exists !== false);
    if (usable.length === 0)
        return '';
    const unavailable = snapshot.projects.filter((project) => project.enabled !== false && project.exists === false);
    const lines = [
        '## Related projects',
        '',
        'The workspace groups ' + String(usable.length) + ' related project(s) that a change here usually touches '
            + '(for example the frontend, the docs, or a sibling service). Treat them as in scope when the request '
            + 'plausibly involves them, and read them directly instead of asking the user for a path.',
        '',
        'Write scope for this session: ' + boundary + '.',
        '',
    ];
    for (const project of usable) {
        lines.push(line(project));
    }
    if (unavailable.length > 0) {
        lines.push('');
        lines.push(String(unavailable.length) + ' further related project(s) are currently unavailable (their path is '
            + 'missing); they are omitted on purpose — do not guess their content.');
    }
    return lines.join('\n');
}
function line(project) {
    const note = project.note === '' ? '' : ' — when to touch: ' + project.note.replace(/\s+/g, ' ').trim();
    return '- ' + project.name + ' — ' + project.path + note;
}
/**
 * One change, as an append-only snapshot for the conversation history.
 *
 * It carries the CURRENT list, so the model never has to guess whether the frozen
 * section is still true, and it says what changed so a note edit is unambiguous.
 * The text is static: repeated assemblies render the identical string, which is
 * what keeps it from being rewritten (and re-charged) later.
 */
export function changeNotice(summary, current) {
    const head = 'Related projects changed for this workspace: ' + summary + '. ';
    if (current === '') {
        return head + 'There are no usable related projects now; ignore every earlier list, including earlier notices.';
    }
    return head + 'The list below is current and supersedes the list in your system prompt as well as any earlier notice.\n\n' + current;
}
