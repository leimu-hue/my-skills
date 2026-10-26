/**
 * 面向 agent 的工具。
 *
 * 这里刻意的**分工**（而不是「能加就加」）：
 *
 *   * **启停技能是用户的决定。** 技能开关改变的是「模型能看见什么、能调什么」——那是能力面，
 *     不是内容。让模型自己改，等于让它决定自己的权限边界；被提示词注入之后，它还可以悄悄
 *     关掉一条本该拦住它的技能，或者打开你特意关掉的技能，而你收不到任何回执。所以默认
 *     **不注册**切换工具，只有配置里显式打开 `allowAgentSwitch` 才会出现。
 *   * **读正文交给官方 `skill` 工具。** 官方 `@deepseek-ai/dsh-tool-skill` 就是「按名字加载
 *     完整指令」，而且它经 `ctx.skills.get()` 拿到的正是我们候选里的正文与 resourceBase。
 *     再做一个 `skill_read` 只是第二个入口，没有新信息。
 *   * **只保留一个只读工具。** 会话里的 `<available_skills>` 目录按设计**藏掉**被停用与被覆盖
 *     的技能，所以模型无法解释「为什么这条技能不可用」。`skill_list` 只补这一件事：
 *     把停用 / 被覆盖 / 结构不完整 / 仅手动的条目连同原因列出来。它不写任何东西。
 *
 * 另外：新增与删除技能**不需要**工具参与。写一个 `SKILL.md` 由官方 `dsh-skill-filesystem`
 * 经 `fs/observed` 与 watcher 自动发现并广播 `skills/change`；我们只在改策略之后调
 * provider 的 `control.invalidate()`。
 */
import type { SkillService } from '../skills/service.js'
import { allRows } from '../skills/view.js'
import { modelVisible, rowMatchesRef } from '../skills/policy.js'
import type { OpResult } from '../shared/result.js'
import type { SkillRow } from '../shared/types.js'

interface ToolRunContext {
  agent?: { session?: { header?: { cwd?: string } } }
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

export interface ToolOptions {
  /**
   * 是否把「切换」交给模型。默认 `false`：启停是用户 / 场景的判断，不是模型的。
   * 打开后只多一个 `skill_switch`，面板与场景照旧。
   */
  allowAgentSwitch?: boolean
}

function cwdOf(exec: ToolRunContext | undefined): string | undefined {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : undefined
}

function flagOf(row: SkillRow): string {
  if (row.shadowed) return `shadowed-by:${row.shadowedBy?.rootKey ?? '?'}`
  if (!row.policy.rootOn) return 'source-off'
  if (!row.policy.skillOn) return 'disabled-by-user'
  if (!row.loadable) return 'invalid'
  if (row.policy.modelInvocable) return 'enabled'
  return 'manual-only'
}

/** 模型此刻真正能用的行；`all` 打开时不过滤。 */
function rowsToShow(rows: SkillRow[], all: boolean): SkillRow[] {
  return all ? rows : rows.filter(modelVisible)
}

/** 一条技能一行：名字、来源、状态、路径。顺序稳定，便于扫读。 */
export function renderRows(rows: SkillRow[], options: { all: boolean }): string {
  return rowsToShow(rows, options.all)
    .map((row) => {
      const marks = [flagOf(row)]
      if (row.preferred) marks.push('preferred')
      if (row.nested) marks.push('nested')
      if (row.linked) marks.push('linked')
      return `${row.declaredName}  |  root:${row.rootKey}  |  ${marks.join(' ')}  |  ${row.docPath}`
    })
    .join('\n')
}

/** 把写 op 的回执翻成工具结果：失败即抛，成功时取出 `changed`。 */
function changedOf(result: OpResult): boolean {
  if (result.ok !== true) throw new Error(String(result.error ?? 'switch failed'))
  return (result.data as { changed?: boolean } | undefined)?.changed === true
}

export function createTools(service: SkillService, options: ToolOptions = {}): ToolDefinition[] {
  const listTool: ToolDefinition = {
    name: 'skill_list',
    description: 'Read-only: list agent skills with their switch state and the reason they are unavailable. '
      + 'The session skill catalog only shows skills the model can use, so use this when a skill you expected '
      + 'is missing: it reports disabled-by-user / source-off / shadowed-by / invalid. '
      + 'Loading a skill body is the official `skill` tool. Switching skills is not available to the model '
      + 'unless the user enabled it in the tool center settings.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        all: {
          type: 'boolean',
          description: 'Include disabled / shadowed / manual-only skills (default true — that is this tool\'s point).',
        },
        root: { type: 'string', description: 'Only list skills from this root key (see the root: field).' },
        search: { type: 'string', description: 'Only list skills whose name or description contains this text.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' }, count: { type: 'integer' } },
        required: ['text', 'count'],
      },
      render: (_args, value) => [{ type: 'text', text: String((value as { text?: unknown } | null)?.text ?? '') }],
    },
    async execute(args, exec) {
      // 默认列全部：模型需要知道的恰恰是「为什么这条用不了」，而目录只给能用的。
      const all = args.all !== false
      const view = await service.view(cwdOf(exec))
      let rows = allRows(view)
      const root = typeof args.root === 'string' ? args.root.trim() : ''
      if (root !== '') rows = rows.filter((row) => row.rootKey === root)
      const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : ''
      if (search !== '') {
        rows = rows.filter((row) =>
          row.declaredName.toLowerCase().includes(search)
          || row.name.toLowerCase().includes(search)
          || row.description.toLowerCase().includes(search))
      }
      const header = [
        `${view.counts.enabled} enabled / ${view.counts.disabled} disabled / ${view.counts.shadowed} shadowed`,
        `${view.roots.length} roots`,
        `scope: ${view.scopeKey === '' ? 'global' : view.scopeKey}`,
      ].join(' · ')
      const body = renderRows(rows, { all })
      return {
        count: rowsToShow(rows, all).length,
        text: `${header}\n${body === '' ? '(no skills)' : body}`,
      }
    },
  }

  const tools: ToolDefinition[] = [listTool]
  if (options.allowAgentSwitch !== true) return tools

  /**
   * 可选：把切换交给模型。
   *
   * 只有用户在插件配置里显式打开 `allowAgentSwitch` 时才会注册 —— 那是「我在对话里说一句，
   * 让它替我关掉某条」的用法，默认关。形状与面板完全一致：不写技能文件，只写本插件策略，
   * 写完调 provider 失效。
   */
  const switchTool: ToolDefinition = {
    name: 'skill_switch',
    description: 'Switch a skill, a whole skill source, or a same-name priority. Only registered when the user has '
      + 'enabled agent switching in the tool center settings; the user-facing way to do this is the panel or a scene. '
      + 'Never modifies skill files: the switch is this plugin\'s own policy.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', description: 'Skill name (declared name or directory name).' },
        enabled: { type: 'boolean', description: 'true = usable by the model, false = switched off.' },
        root: { type: 'string', description: 'Root key; disambiguates a same-name skill, required for prefer.' },
        source: { type: 'string', description: 'Root key to enable/disable entirely (instead of one skill).' },
        prefer: { type: 'boolean', description: 'true = pin this root for the name; false = drop the pin.' },
        scope: {
          type: 'string',
          enum: ['global', 'session'],
          description: 'Reserved: only "global" is implemented today.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' }, changed: { type: 'boolean' } },
        required: ['text', 'changed'],
      },
      render: (_args, value) => [{ type: 'text', text: String((value as { text?: unknown } | null)?.text ?? '') }],
    },
    async execute(args, exec) {
      const cwd = cwdOf(exec)
      const scope = typeof args.scope === 'string' ? args.scope : 'global'
      if (scope === 'session') {
        // 工具如实报告「接口已预留」，而不是假装成功。
        throw new Error('scope="session" is reserved and not implemented yet; use scope="global" (the panel is global too).')
      }
      const source = typeof args.source === 'string' ? args.source.trim() : ''
      if (source !== '') {
        if (typeof args.enabled !== 'boolean') throw new Error('source requires "enabled" (true/false)')
        const changed = changedOf(await service.setSource(source, args.enabled, undefined, cwd))
        return {
          changed,
          text: `${source} ${args.enabled ? 'enabled' : 'disabled'}${changed ? '' : ' (already in that state)'}`,
        }
      }
      const root = typeof args.root === 'string' ? args.root.trim() : ''
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      if (args.prefer !== undefined) {
        if (name === '' || root === '') throw new Error('prefer requires both "name" and "root"')
        const changed = changedOf(await service.prefer(root, name, args.prefer === true))
        return {
          changed,
          text: args.prefer === true
            ? `${name} now resolves from ${root}${changed ? '' : ' (already pinned)'}`
            : `${name} priority pin dropped${changed ? '' : ' (there was no pin)'}`,
        }
      }
      if (name === '') throw new Error('give "name" (one skill), "source" (a whole root), or "prefer" with root')
      if (typeof args.enabled !== 'boolean') throw new Error('"enabled" is required (true/false)')
      // 把名字解析到它胜出的来源，调用方就不必知道来源键。
      const row = allRows(await service.view(cwd))
        .find((candidate) => !candidate.shadowed && rowMatchesRef(candidate, { root, name }))
      if (row === undefined) throw new Error(`skill "${name}" is not known${root === '' ? '' : ` in root ${root}`}`)
      const changed = changedOf(await service.setSkill(row.rootKey, row.name, args.enabled, cwd))
      return {
        changed,
        text: `${row.declaredName} (${row.rootKey}) ${args.enabled ? 'enabled' : 'disabled'}${changed ? '' : ' (already in that state)'}`,
      }
    },
  }

  tools.push(switchTool)
  return tools
}
