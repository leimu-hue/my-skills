/**
 * `related_projects` 工具：读取注册表，或再注册一个项目。
 *
 * 只能读和添加。重命名 / note / 启用 / 删除都留在 UI，因为 note 是用户对
 * “这个项目何时相关”的自主判断，agent 不得悄悄改写它。
 *
 * 用官方的 `defineTool` 声明：参数是一张「属性 → 值 schema」的表（可选项写
 * `required: true`），注册表据此生成 JSON Schema，并在调用前替本工具校验参数；
 * 输出也必须声明 canonical schema 与纯函数 `render`。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { RegistryError } from '../shared/errors.js';
import { workspaceOfAgent } from '../workspace/service.js';
export const TOOL_NAME = 'related_projects';
function json(value) {
    return JSON.stringify(value, null, 2);
}
export function createTool(ctx, registry, sessions) {
    return defineTool({
        name: TOOL_NAME,
        description: 'List or add a related project for this workspace. A related project is a sibling repository the '
            + 'user usually changes with this one. Use action="list" before assuming a path; action="add" to remember one. '
            + "Only this workspace's registry is writable, and only by adding; renaming, disabling, and deletion are UI-only.",
        parameters: {
            action: {
                type: 'string',
                enum: ['list', 'add'],
                required: true,
                description: "list = read this workspace's projects; add = register one.",
            },
            path: { type: 'string', description: 'add: absolute directory path.' },
            name: { type: 'string', description: 'add: display name (defaults to the directory name).' },
            note: { type: 'string', description: 'add: when this project needs a change.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: { text: { type: 'string', required: true } },
            },
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        async execute(args, exec) {
            const agent = exec.agent;
            if (agent === undefined)
                throw new Error(TOOL_NAME + ' requires an owning agent session');
            const workspace = workspaceOfAgent(ctx, agent);
            if (workspace === '')
                throw new Error('This session has no committed workspace directory.');
            const action = args.action;
            if (action === 'list') {
                /* 所有已存的行，包括被禁用的：agent 必须知道某个兄弟项目已注册但被关掉了，
                   否则它会重复添加同一路径——那是个不会重新启用它的空操作，于是工具会在
                   什么都没真正变化的情况下声称成功。 */
                const snapshot = registry.snapshot(workspace);
                return {
                    text: json({
                        workspace,
                        projects: snapshot.projects,
                        limits: snapshot.limits,
                        unavailable: snapshot.projects.filter((project) => !project.exists).map((project) => project.name),
                    }),
                };
            }
            const path = typeof args.path === 'string' ? args.path : '';
            if (path === '')
                throw new Error('add requires the absolute "path" of the project directory');
            try {
                const project = registry.add(workspace, {
                    path,
                    name: args.name,
                    note: args.note,
                    origin: 'agent',
                });
                /* agent 改了注册表：该 workspace 下其他每个存活会话都会追加一份快照，
                   这样谁都不会拿着过期列表继续干活——也不必重写任何冻结小节。 */
                sessions.notify(workspace, 'added ' + project.name + ' (' + project.path + ')');
                return { text: json({ added: project, workspace }) };
            }
            catch (error) {
                if (error instanceof RegistryError)
                    throw new Error('Cannot add that path: ' + error.code);
                throw error;
            }
        },
    });
}
