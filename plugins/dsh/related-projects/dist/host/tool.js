/**
 * The `related_projects` tool: read the registry, or register one more project.
 *
 * Read and add only. Rename / note / enable / delete stay in the UI, because the
 * note is the user's own judgement about when a project matters and the agent
 * must not silently rewrite it.
 */
import { RegistryError } from './store.js';
import { workspaceOfAgent } from './context.js';
import { TOOL_NAME } from './sessions.js';
export function createTool(ctx, registry, sessions) {
    const text = (value) => JSON.stringify(value, null, 2);
    return {
        name: TOOL_NAME,
        description: 'List the related projects registered for the current workspace, or register one more. '
            + 'A related project is another local repository the user usually changes together with this one '
            + '(frontend, docs, a sibling service). Use action="list" before assuming a path; use action="add" when '
            + 'the user asks you to remember a project for this workspace. Only the current workspace can be written, '
            + 'and only adding is allowed — renaming, disabling and deleting belong to the user interface.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'add'],
                    description: 'list = read the registry for this workspace; add = register one more project.',
                },
                path: { type: 'string', description: 'add only: absolute path of the related project directory.' },
                name: { type: 'string', description: 'add only: short display name (defaults to the directory name).' },
                note: { type: 'string', description: 'add only: when this project needs a change, in one or two sentences.' },
            },
            required: ['action'],
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: { text: { type: 'string' } },
                required: ['text'],
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: String(value?.text ?? ''),
                }],
        },
        async execute(args, exec) {
            const agent = exec?.agent;
            if (agent === undefined || agent === null)
                throw new Error(TOOL_NAME + ' requires an owning agent session');
            const workspace = workspaceOfAgent(ctx, agent);
            if (workspace === '')
                throw new Error('This session has no committed workspace directory.');
            const action = typeof args.action === 'string' ? args.action : 'list';
            if (action === 'list') {
                const snapshot = registry.snapshot(workspace);
                return {
                    text: text({
                        workspace,
                        projects: snapshot.projects,
                        limits: snapshot.limits,
                        unavailable: snapshot.projects
                            .filter((project) => project.exists === false)
                            .map((project) => project.name),
                    }),
                };
            }
            const path = typeof args.path === 'string' ? args.path : '';
            if (path === '')
                throw new Error('add requires the absolute "path" of the project directory');
            try {
                const project = registry.add(workspace, {
                    path,
                    name: typeof args.name === 'string' ? args.name : undefined,
                    note: typeof args.note === 'string' ? args.note : undefined,
                    origin: 'agent',
                });
                /* The agent changed the registry: announce it, so other sessions of the
                   same workspace do not keep working from a stale list. */
                sessions.notify(workspace, 'added ' + project.name + ' (' + project.path + ')');
                return { text: text({ added: project, workspace }) };
            }
            catch (error) {
                if (error instanceof RegistryError)
                    throw new Error('Cannot add that path: ' + error.code);
                throw error;
            }
        },
    };
}
