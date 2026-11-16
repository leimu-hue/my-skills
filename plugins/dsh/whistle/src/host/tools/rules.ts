/**
 * `whistle_rules`：规则文件的读与写（本插件唯一会改动用户环境的工具）。
 *
 * 几个刻意的决定：
 *   - 写（`set`）之后一定回读比较：`rules/add` 在部分 whistle 版本上不是覆盖语义，
 *     静默「写成功却没生效」比报错更糟；
 *   - `select` 之后顺手 `turnOn`：规则引擎全局关闭时，勾中一个文件也不会生效，
 *     这是最常见的「我明明选了规则却没起作用」；
 *   - 每个动作的返回都带当前开关状态，模型不必再补一次 `whistle_status`。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { WhistleError, asToolFailure, attempt } from '../shared/errors.ts'
import { jsonText, rulePreview } from '../whistle/format.ts'
import { ruleExists, ruleValueOf, sameRuleText, summariseRules } from '../whistle/rules.ts'
import type { RulesSummary } from '../whistle/rules.ts'
import type { WhistleApi, WhistleRuleFile } from '../whistle/types.ts'
import type { WhistleClient } from '../whistle/client.ts'

export const RULES_TOOL = 'whistle_rules'

const ACTIONS = [
  'list',
  'get',
  'set',
  'select',
  'unselect',
  'enable',
  'disable',
  'moveToTop',
  'multiSelect',
  'laterFirst',
] as const

const READ_ONLY: ReadonlySet<string> = new Set(['list', 'get'])

export function createRulesTool(client: WhistleClient): ToolDefinition {
  return defineTool({
    name: RULES_TOOL,
    description: 'Read and write Whistle rule files (the Rules tab). Actions: list (names, selection, previews), get (one '
      + 'file in full), set (create or overwrite a file, then read it back to verify), select/unselect (tick a file; '
      + 'select also turns the engine on), enable/disable (global rule engine), moveToTop (match this file first), '
      + 'multiSelect and laterFirst (engine options, need "enabled"). Prefer one named file over editing everything: '
      + 'rule text is live traffic policy, so keep changes small and tell the user what you wrote.',
    parameters: {
      action: {
        type: 'string',
        enum: [...ACTIONS],
        required: true,
        description: 'list | get | set | select | unselect | enable | disable | moveToTop | multiSelect | laterFirst',
      },
      name: { type: 'string', description: 'Rule file name (required by get/set/select/moveToTop; optional for unselect).' },
      value: { type: 'string', description: 'set: the whole rule text to write, newline separated.' },
      selected: { type: 'boolean', description: 'set: tick the file after writing (default true).' },
      enabled: { type: 'boolean', description: 'multiSelect / laterFirst: the switch value.' },
      content: { type: 'boolean', description: 'list: include every rule file body (default false).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: (args) => READ_ONLY.has(args.action),

    async execute(args, exec) {
      const action = args.action
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const value = typeof args.value === 'string' ? args.value : ''

      try {
        return await client.call('whistle rules: ' + action, async (api) => {
          switch (action) {
            case 'list': {
              const files = await api.rules.getList()
              const status = await attempt(async () => api.rules.getStatus())
              return renderList(files, args.content === true, status.ok ? summariseRules(status.value) : undefined)
            }

            case 'get': {
              requireName(name, action)
              const raw = await api.rules.get(name)
              if (!ruleExists(raw)) {
                throw new WhistleError(
                  'not-found',
                  'Rule file "' + name + '" does not exist.',
                  'Call whistle_rules action="list" to see the configured file names.',
                )
              }
              const text = ruleValueOf(raw)
              return '# rules/' + name + '\n' + (text.trim() === '' ? '(empty)' : text)
            }

            case 'set': {
              requireName(name, action)
              if (value.trim() === '') {
                throw new WhistleError(
                  'invalid',
                  'action="set" needs a non-empty "value".',
                  'Pass the rule lines, e.g. "* api.example.com 127.0.0.1:8080".',
                )
              }
              const selected = args.selected !== false
              await api.rules.add(name, value, selected)
              const readback = ruleValueOf(await api.rules.get(name))
              const verified = sameRuleText(readback, value)
              return jsonText({
                action,
                name,
                selected,
                verified,
                ...(verified
                  ? {}
                  : {
                    readback: rulePreview(readback, 200),
                    note: 'The read-back does not match what was written on this Whistle version (rules/add may append '
                      + 'instead of overwrite). Check the Rules tab in the capture UI before relying on it.',
                  }),
                rules: await rulesSummary(api),
              })
            }

            case 'select': {
              requireName(name, action)
              const exists = await api.rules.select(name)
              /* 引擎全局关闭时勾中也不生效，这是「选了规则却没起作用」的头号原因。 */
              if (exists === true) await api.rules.turnOn()
              return jsonText({
                action,
                name,
                exists,
                ...(exists === true ? {} : { note: 'No rule file with that name; check action="list".' }),
                rules: await rulesSummary(api),
              })
            }

            case 'unselect': {
              const done = await api.rules.unselect(name === '' ? undefined : name)
              return jsonText({
                action,
                name: name === '' ? '(all files)' : name,
                done,
                rules: await rulesSummary(api),
              })
            }

            case 'enable':
              await api.rules.turnOn()
              return jsonText({ action, rules: await rulesSummary(api) })

            case 'disable':
              await api.rules.turnOff()
              return jsonText({ action, rules: await rulesSummary(api) })

            case 'moveToTop': {
              requireName(name, action)
              await api.rules.moveToTop(name)
              return jsonText({ action, name, rules: await rulesSummary(api) })
            }

            case 'multiSelect':
            case 'laterFirst': {
              const enabled = args.enabled
              if (typeof enabled !== 'boolean') {
                throw new WhistleError(
                  'invalid',
                  'action="' + action + '" needs "enabled": true or false.',
                  'multiSelect allows several files at once; laterFirst makes later rules win.',
                )
              }
              if (action === 'multiSelect') await api.rules.setMultiSelect(enabled)
              else await api.rules.setLaterFirst(enabled)
              return jsonText({ action, enabled, rules: await rulesSummary(api) })
            }

            default:
              throw new WhistleError('invalid', 'Unknown action: ' + String(action))
          }
        }, { signal: exec.signal })
      } catch (cause) {
        throw asToolFailure(cause)
      }
    },
  })
}

function requireName(name: string, action: string): void {
  if (name !== '') return
  throw new WhistleError(
    'invalid',
    'action="' + action + '" needs the rule file "name".',
    'Names come from whistle_rules action="list".',
  )
}

async function rulesSummary(api: WhistleApi): Promise<unknown> {
  const status = await attempt(async () => api.rules.getStatus())
  return status.ok ? summariseRules(status.value) : { error: status.reason }
}

function renderList(files: WhistleRuleFile[], withContent: boolean, summary: RulesSummary | undefined): string {
  /* 计数以 `rules/status` 为准：`rules/list` 不返回内置的 Default 文件，
     用文件数当总数会让「状态说 2 个、表格只有 1 行」看着像 bug。 */
  const total = summary === undefined ? files.length : summary.total
  const selected = summary === undefined
    ? files.filter((file) => file.selected === true).length
    : summary.selected.length
  const lines: string[] = [
    'rule files: ' + total + '  ·  selected: ' + selected
      + (summary === undefined ? '' : '  ·  engine disabled: ' + summary.disabled
        + '  ·  plugins disabled: ' + summary.pluginsDisabled),
  ]
  if (files.length === 0 && total === 0) {
    lines.push('No rule files yet: create one with action="set" (name + value).')
    return lines.join('\n')
  }
  if (files.length > 0) {
    lines.push(['name'.padEnd(20), 'on', 'lines'.padStart(5), 'preview'].join('  '))
    for (const file of files) {
      const text = typeof file.value === 'string' ? file.value : ''
      const count = text.split(/\r?\n/).filter((line) => line.trim() !== '').length
      lines.push([
        file.name.padEnd(20),
        file.selected === true ? ' ✓' : '  ',
        String(count).padStart(5),
        rulePreview(text),
      ].join('  '))
    }
  }
  const known = new Set(files.map((file) => file.name))
  const hidden = (summary?.files ?? []).filter((file) => !known.has(file.name))
  if (hidden.length > 0) {
    lines.push('')
    lines.push('Configured but without readable content (`rules/list` omits them): '
      + hidden.map((file) => file.name + (file.selected ? ' (selected)' : '')).join(', '))
  }
  if (!withContent) return lines.join('\n')
  for (const file of files) {
    lines.push('')
    lines.push('── rules/' + file.name + (file.selected === true ? ' (selected)' : '') + ' ──')
    lines.push(typeof file.value === 'string' && file.value !== '' ? file.value : '(empty)')
  }
  return lines.join('\n')
}
