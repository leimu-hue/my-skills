/**
 * 工具面：让模型能看见隔离，也能在用户要求时建立隔离。
 *
 * 分工：
 *   - `worktree_list` / `worktree_diff` 只读；
 *   - `worktree_create` 只做加法：建检出、注册工作区、按配置在检出里开会话；
 *   - 会改用户主仓的 `apply`、会删掉工作的 `remove` 只留给人和命令。
 *
 * 写操作是否放行由 `tools/pre-execute` 的 allow / deny / ask 决定，这里不重复判断。
 * 创建必须走这个入口：模型自己跑 `git worktree add` 会留下 Harness 看不见、
 * 也无法清理的检出。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { DomainError } from "../shared/errors.js";
import { inspectRepository } from "../git/repository.js";
export const LIST_TOOL = 'worktree_list';
export const DIFF_TOOL = 'worktree_diff';
export const CREATE_TOOL = 'worktree_create';
function cwdOf(agent) {
    const cwd = agent?.session?.header?.cwd;
    return typeof cwd === 'string' && cwd !== '' ? cwd : '';
}
async function repositoryOf(timeoutMs, explicit, agent) {
    const directory = typeof explicit === 'string' && explicit !== '' ? explicit : cwdOf(agent);
    if (directory === '')
        throw new DomainError('no-workspace', 'this session has no working directory');
    return inspectRepository(directory, { timeoutMs });
}
function json(value) {
    return JSON.stringify(value, null, 2);
}
function text(text) {
    return { text };
}
const OUTPUT = {
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            text: { type: 'string', required: true },
        },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
};
export function createTools(service, timeoutMs) {
    const list = defineTool({
        name: LIST_TOOL,
        description: 'Inspect the isolated checkouts of a Git repository. Reports whether the session is already inside '
            + 'a linked worktree (isolation check), then every checkout Git knows about: name, branch, dirty file count, commits '
            + 'ahead of its base, and whether this plugin created it. Read-only.',
        parameters: {
            repository: {
                type: 'string',
                description: 'Absolute path inside the repository (a worktree path works too). Defaults to the session working directory.',
            },
        },
        output: OUTPUT,
        async execute(args, exec) {
            const info = await repositoryOf(timeoutMs, args.repository, exec.agent);
            const worktrees = await service.listFor(info.mainRoot);
            return text(json({
                repository: info.mainRoot,
                isolation: {
                    cwd: info.root,
                    /* `isWorktree` 已经把 submodule 排除掉了，这里不再重复判断。 */
                    inWorktree: info.isWorktree,
                    inSubmodule: info.isSubmodule,
                    branch: info.branch,
                },
                worktrees: worktrees.map((view) => ({
                    id: view.id,
                    name: view.name,
                    path: view.path,
                    origin: view.origin,
                    branch: view.branch,
                    state: view.state,
                    current: view.current,
                    dirty: view.dirty,
                    changedFiles: view.files,
                    ahead: view.ahead,
                    behind: view.behind,
                })),
            }));
        },
    });
    const create = defineTool({
        name: CREATE_TOOL,
        description: 'Create an isolated Git checkout (worktree) for this repository. Use it when the user asks to work '
            + 'in a separate worktree / isolated workspace for a task; do not create one on your own initiative. '
            + 'Prefer this over running `git worktree add` yourself. '
            + 'It first checks whether the session is already inside a linked worktree and returns created=false if so — '
            + 'never create a second one in that case. The default mode creates a branch named `<prefix><name>`, where the '
            + 'prefix is the user-configured setting (default `worktree/`); pass mode="detached" for a disposable checkout '
            + 'whose changes come back via the user\'s Apply action. The Host registers the checkout as a workspace and, '
            + 'when it can, starts a session whose working directory is that checkout.',
        parameters: {
            name: {
                type: 'string',
                required: true,
                description: 'Short name, also the directory name (letters, digits, dot, underscore, hyphen).',
            },
            repository: {
                type: 'string',
                description: 'Absolute path inside the repository. Defaults to the session working directory.',
            },
            base: {
                type: 'string',
                description: 'Commit-ish to branch from. Defaults to the configured base policy (remote default branch, or main HEAD).',
            },
            mode: {
                type: 'string',
                enum: ['branch', 'detached'],
                description: 'branch (default) commits onto a new branch; detached leaves no branch and returns changes through apply.',
            },
            branch: {
                type: 'string',
                description: 'Branch name for mode=branch. Defaults to `worktree/<name>`; must not already exist.',
            },
        },
        output: OUTPUT,
        async execute(args, exec) {
            /* 传会话目录而不是主仓：隔离探测正是从「这个目录」判断是否已在隔离里。 */
            const directory = typeof args.repository === 'string' && args.repository !== ''
                ? args.repository
                : cwdOf(exec.agent);
            const result = await service.create({
                repository: directory === '' ? undefined : directory,
                name: args.name,
                base: args.base,
                mode: args.mode,
                branch: args.branch,
                /*
                 * 刻意不传 `task`：那是人让「另一个会话开工」的手段。模型自己传就等于
                 * 开一个兄弟 agent 跟自己抢同一份工作，而且它还看不见结果。
                 */
            });
            const view = result.worktree;
            return text(json({
                created: result.created,
                reason: result.reason ?? null,
                worktree: view === null ? null : {
                    name: view.name,
                    path: view.path,
                    branch: view.branch,
                    base: view.baseBranch,
                    mode: view.mode,
                    origin: view.origin,
                    state: view.state,
                },
                copied: result.copied,
                includeError: result.includeError ?? null,
                commands: result.commands,
                workspaceId: result.workspaceId,
                sessionId: result.sessionId,
                activationError: result.sessionError ?? null,
                next: result.created
                    ? [
                        ...(result.sessionId === null
                            ? ['This Host could not start a session, so this session is still the one to use: read and edit with absolute paths under the reported path.']
                            : [
                                `A session whose working directory is the checkout was created (${result.sessionId}). Ask the user to switch to it instead of editing from here — this session still points at ${view?.repository ?? directory}.`,
                            ]),
                        'When the work is verified, commit on the branch (mode=branch) or let the user apply the diff (mode=detached).',
                    ]
                    : [
                        'Already isolated: keep working in the current directory, do not create another worktree.',
                    ],
            }));
        },
    });
    const diff = defineTool({
        name: DIFF_TOOL,
        description: 'Show the uncommitted and committed changes of one managed worktree against the commit it '
            + 'was created from. Read-only; the patch is truncated to keep the context small.',
        parameters: {
            name: {
                type: 'string',
                required: true,
                description: 'Worktree name as reported by ' + LIST_TOOL + '.',
            },
            repository: {
                type: 'string',
                description: 'Absolute path inside the repository. Defaults to the session working directory.',
            },
        },
        output: OUTPUT,
        async execute(args, exec) {
            const info = await repositoryOf(timeoutMs, args.repository, exec.agent);
            const key = String(args.name);
            const record = service.findIn(info.mainRoot, key);
            if (record === undefined) {
                const available = (await service.listFor(info.mainRoot)).map((view) => view.name);
                throw new DomainError('unknown-worktree', `no worktree named ${JSON.stringify(key)} in ${info.mainRoot}`
                    + (available.length === 0 ? ' (this repository has none)' : `; available: ${available.join(', ')}`));
            }
            const value = await service.diff(record.id);
            const patch = value.patch.slice(0, 8_000);
            return text(json({
                id: record.id,
                name: record.name,
                path: record.path,
                branch: record.branch,
                files: value.files,
                untracked: value.untracked,
                truncated: value.truncated || value.patch.length > patch.length,
                patch,
            }));
        },
    });
    return [list, create, diff];
}
