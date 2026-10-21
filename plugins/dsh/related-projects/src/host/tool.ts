/**
 * The `related_projects` tool: read the registry, or register one more project.
 *
 * Read and add only. Rename / note / enable / delete stay in the UI, because the
 * note is the user's own judgement about when a project matters and the agent
 * must not silently rewrite it.
 */
import { RegistryError } from './store.js'
import { workspaceOfAgent } from './context.js'
import { TOOL_NAME } from './sessions.js'
import type { AgentLike, ServiceBag } from './context.js'
import type { Registry } from './store.js'
import type { SessionRegistry } from './sessions.js'

interface ToolRunContext {
  agent?: AgentLike
}

interface ContentBlock {
  type: 'text'
  text: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: unknown): ContentBlock[]
  }
  execute(args: Record<string, unknown>, exec: ToolRunContext): Promise<unknown>
}

export function createTool(ctx: ServiceBag, registry: Registry, sessions: SessionRegistry): ToolDefinition {
  const text = (value: unknown): string => JSON.stringify(value, null, 2)

  return {
    name: TOOL_NAME,
    description: 'List or add a related project for this workspace. A related project is a sibling repository the '
      + 'user usually changes with this one. Use action="list" before assuming a path; action="add" to remember one. '
      + "Only this workspace's registry is writable, and only by adding; renaming, disabling, and deletion are UI-only.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add'],
          description: "list = read this workspace's projects; add = register one.",
        },
        path: { type: 'string', description: 'add: absolute directory path.' },
        name: { type: 'string', description: 'add: display name (defaults to the directory name).' },
        note: { type: 'string', description: 'add: when this project needs a change.' },
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
        text: String((value as { text?: unknown } | null)?.text ?? ''),
      }],
    },

    async execute(args, exec) {
      const agent = exec?.agent
      if (agent === undefined || agent === null) throw new Error(TOOL_NAME + ' requires an owning agent session')
      const workspace = workspaceOfAgent(ctx, agent)
      if (workspace === '') throw new Error('This session has no committed workspace directory.')

      const action = typeof args.action === 'string' ? args.action : 'list'
      if (action === 'list') {
        const snapshot = registry.snapshot(workspace)
        return {
          text: text({
            workspace,
            projects: snapshot.projects,
            limits: snapshot.limits,
            unavailable: snapshot.projects
              .filter((project) => project.exists === false)
              .map((project) => project.name),
          }),
        }
      }
      if (action !== 'add') throw new Error('Unknown action "' + action + '"; use "list" or "add".')

      const path = typeof args.path === 'string' ? args.path : ''
      if (path === '') throw new Error('add requires the absolute "path" of the project directory')
      try {
        const project = registry.add(workspace, {
          path,
          name: typeof args.name === 'string' ? args.name : undefined,
          note: typeof args.note === 'string' ? args.note : undefined,
          origin: 'agent',
        })
        /* The agent changed the registry: every other live session of this
           workspace gets one appended snapshot, so none keeps working from a
           stale list — and no frozen section has to be rewritten. */
        const delivered = sessions.notify(workspace, 'added ' + project.name + ' (' + project.path + ')').delivered
        return { text: text({ added: project, workspace, sessionsNotified: delivered }) }
      } catch (error) {
        if (error instanceof RegistryError) throw new Error('Cannot add that path: ' + error.code)
        throw error
      }
    },
  }
}
