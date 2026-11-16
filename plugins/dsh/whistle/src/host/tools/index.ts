/**
 * 工具清单的唯一出口。
 *
 * 顺序即模型看到的顺序：先体检（status），再按「列表 -> 单条 -> 帧」展开抓包，
 * 最后才是会改环境的规则与值。命名统一 `whistle_*`，一眼能看出这些工具属于
 * 同一个外部系统，也不会和 DSH 自带的工具撞名。
 */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { WhistleClient } from '../whistle/client.ts'
import { createStatusTool } from './status.ts'
import { createSessionsTool } from './sessions.ts'
import { createSessionTool } from './session.ts'
import { createFramesTool } from './frames.ts'
import { createRulesTool } from './rules.ts'
import { createValuesTool } from './values.ts'
import { createPluginsTool } from './plugins.ts'

export { STATUS_TOOL } from './status.ts'
export { SESSIONS_TOOL } from './sessions.ts'
export { SESSION_TOOL } from './session.ts'
export { FRAMES_TOOL } from './frames.ts'
export { RULES_TOOL } from './rules.ts'
export { VALUES_TOOL } from './values.ts'
export { PLUGINS_TOOL } from './plugins.ts'

export function createTools(client: WhistleClient): ToolDefinition[] {
  return [
    createStatusTool(client),
    createSessionsTool(client),
    createSessionTool(client),
    createFramesTool(client),
    createRulesTool(client),
    createValuesTool(client),
    createPluginsTool(client),
  ]
}
