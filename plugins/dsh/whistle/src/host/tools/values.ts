/**
 * `whistle_values`：Values 面板（`{name}` 占位符的值）。
 *
 * 规则里写的 `* api.example.com {target}` 靠的就是这张表，所以它和规则工具
 * 放在一起：改完规则引用、再改这里的目标地址，是一个连贯的动作。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { WhistleError, asToolFailure } from '../shared/errors.ts'
import { jsonText, truncate } from '../whistle/format.ts'
import type { WhistleClient } from '../whistle/client.ts'
import type { WhistleValue } from '../whistle/types.ts'

export const VALUES_TOOL = 'whistle_values'

export function createValuesTool(client: WhistleClient): ToolDefinition {
  return defineTool({
    name: VALUES_TOOL,
    description: 'Read and write Whistle Values (the Values tab): named snippets that rule files reference as {name}. '
      + 'Actions: list, get (one value in full), set (create or overwrite). Watch out — a value can be a whole rule block, '
      + 'so list shows only the first line; use get when the content matters.',
    parameters: {
      action: { type: 'string', enum: ['list', 'get', 'set'], required: true, description: 'list | get | set' },
      name: { type: 'string', description: 'Value name (required by get/set).' },
      value: { type: 'string', description: 'set: the value content.' },
      content: { type: 'boolean', description: 'list: include every value body (default false).' },
      limit: { type: 'number', description: 'list with content: max characters per value (default 2000).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: (args) => args.action === 'list' || args.action === 'get',

    async execute(args, exec) {
      const action = args.action
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const value = typeof args.value === 'string' ? args.value : ''

      try {
        return await client.call('whistle values: ' + action, async (api) => {
          if (action === 'list') {
            const values = await api.values.getList()
            return renderList(values, args.content === true, typeof args.limit === 'number' ? args.limit : 2000)
          }
          if (name === '') {
            throw new WhistleError('invalid', 'action="' + action + '" needs the value "name".', 'Names come from whistle_values action="list".')
          }
          if (action === 'get') {
            const raw = await api.values.get(name)
            const text = typeof raw === 'string' ? raw : ''
            if (text.trim() === '') {
              throw new WhistleError('not-found', 'Value "' + name + '" is empty or does not exist.', 'Call whistle_values action="list".')
            }
            return '# values/' + name + '\n' + text
          }
          if (value === '') {
            throw new WhistleError('invalid', 'action="set" needs a non-empty "value".', 'Pass the value content.')
          }
          await api.values.add(name, value)
          const readback = await api.values.get(name)
          const written = typeof readback === 'string' ? readback : ''
          return jsonText({
            action,
            name,
            verified: written.replace(/\s+$/, '') === value.replace(/\s+$/, ''),
            bytes: value.length,
          })
        }, { signal: exec.signal })
      } catch (cause) {
        throw asToolFailure(cause)
      }
    },
  })
}

function renderList(values: WhistleValue[], withContent: boolean, limit: number): string {
  const lines: string[] = ['values: ' + values.length]
  if (values.length === 0) {
    lines.push('No values yet: create one with action="set" (name + value).')
    return lines.join('\n')
  }
  lines.push(['name'.padEnd(24), 'size'.padStart(7), 'preview'].join('  '))
  for (const item of values) {
    const text = typeof item.value === 'string' ? item.value : ''
    const first = text.split(/\r?\n/)[0] ?? ''
    lines.push([
      item.name.padEnd(24),
      (text.length + 'B').padStart(7),
      truncate(first, 80),
    ].join('  '))
  }
  if (!withContent) return lines.join('\n')
  for (const item of values) {
    lines.push('')
    lines.push('── values/' + item.name + ' ──')
    lines.push(typeof item.value === 'string' && item.value !== '' ? truncate(item.value, limit) : '(empty)')
  }
  return lines.join('\n')
}
