/**
 * MCP 域的逻辑：服务器列表、启停、删除。
 *
 * 刻意不做「新增服务器」表单：启动命令属于用户的主机配置，插件替你拼一个错的命令，
 * 代价是宿主起不来。这里只负责两件幂等的事 —— 启停与删除，且任何写入前先备份。
 */
import { useDomain, type DomainFailure } from '../core/domain.ts'
import type { McpServerRow, McpStateView } from '../core/types.ts'
import type { Translate } from '../../i18n/index.ts'

export interface McpController {
  state: McpStateView | null
  busy: string
  error: DomainFailure | null
  servers: McpServerRow[]
  warnings: string[]
  reload(): void
  toggle(server: McpServerRow, enabled: boolean): void
  remove(server: McpServerRow): void
}

export function useMcp(t: Translate, notify: (message: string) => void): McpController {
  const domain = useDomain<McpStateView>('mcp-state', notify)
  const state = domain.state

  return {
    state,
    busy: domain.busy,
    error: domain.error,
    servers: state?.servers ?? [],
    warnings: state?.warnings ?? [],
    reload: () => { void domain.reload() },
    toggle: (server, enabled) => {
      void domain.act('mcp-toggle', { id: server.id, enabled }, t('mcp.toggled', {
        name: server.name,
        state: enabled ? t('mcp.enabled') : t('mcp.disabled'),
      }))
    },
    remove: (server) => {
      if (!window.confirm(t('mcp.confirmDelete', { name: server.name }))) return
      void domain.act('mcp-delete', { id: server.id })
    },
  }
}
