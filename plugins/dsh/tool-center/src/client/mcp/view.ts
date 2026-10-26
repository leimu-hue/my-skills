/**
 * MCP 域视图：服务器列表 + 启停 + 删除。
 *
 * 刻意不做「新增服务器」表单：启动命令属于用户的主机配置，插件替你拼一个错的命令，
 * 代价是宿主起不来。这里只负责两件幂等的事 —— 启停与删除，且任何写入前先备份。
 */
import { h } from '../core/runtime.js'
import type { DomainProps } from '../core/domain.js'
import { useDomain } from '../core/domain.js'
import type { McpServerRow, McpStateView } from '../core/types.js'
import {
  alertOf,
  badgeOf,
  buttonOf,
  emptyOf,
  errorAlertOf,
  groupActionsOf,
  groupOf,
  headOf,
  listOf,
  mutedOf,
  switchOf,
  toolbarOf,
} from '../core/ui.js'

export function McpView(props: DomainProps): unknown {
  const t = props.t
  const domain = useDomain<McpStateView>('mcp-state', props.notify)
  const state = domain.state
  const servers = state?.servers ?? []
  const warnings = state?.warnings ?? []

  const badges: unknown[] = []
  if (state !== null) {
    badges.push(badgeOf(t('mcp.servers', { n: servers.length })))
    badges.push(badgeOf(t('mcp.backups', { n: state.backupCount }), 'off'))
  }

  const alerts = [
    state !== null && state.patchExists === false ? alertOf(t('mcp.noPatch')) : null,
    warnings.length > 0 ? alertOf(warnings.join(' · ')) : null,
    domain.error === null ? null : errorAlertOf(t, domain.error),
  ]

  return h('div', { className: 'dsk-root' },
    headOf({
      title: t('mcp.title'),
      badges,
      subtitle: t('mcp.subtitle'),
      muted: state === null ? undefined : `${t('mcp.patchPath')}: ${state.patchPath}`,
      alerts,
    }),

    toolbarOf([
      buttonOf({ label: t('page.refresh'), disabled: domain.busy !== '', onClick: () => { void domain.reload() } }),
    ]),

    servers.length === 0
      ? emptyOf(t('mcp.empty'))
      : listOf(servers.map((server) => renderServer(t, server, {
        busy: domain.busy,
        onToggle: (enabled) => {
          void domain.act('mcp-toggle', { id: server.id, enabled }, t('mcp.toggled', {
            name: server.name,
            state: enabled ? t('mcp.enabled') : t('mcp.disabled'),
          }))
        },
        onDelete: () => {
          if (!window.confirm(t('mcp.confirmDelete', { name: server.name }))) return
          void domain.act('mcp-delete', { id: server.id })
        },
      }))))
}

function renderServer(
  t: DomainProps['t'],
  server: McpServerRow,
  handlers: { busy: string; onToggle(enabled: boolean): void; onDelete(): void },
): unknown {
  const command = server.command === '' ? server.url : [server.command, ...server.args].join(' ')
  const disabled = handlers.busy !== ''
  return groupOf(server.id, [
    h('span', { className: 'dsk-group-name' }, server.name),
    badgeOf(server.transport),
    server.enabled ? badgeOf(t('mcp.enabled'), 'ok') : badgeOf(t('mcp.disabled'), 'off'),
    server.declaredAt === 'tool-center' ? badgeOf(t('mcp.overridden'), 'warn') : null,
    h('span', { className: 'dsk-group-path', title: command }, command),
    groupActionsOf([
      switchOf({
        on: server.enabled,
        disabled,
        title: server.enabled ? t('mcp.enabled') : t('mcp.disabled'),
        onClick: () => handlers.onToggle(!server.enabled),
      }),
      buttonOf({ label: t('mcp.delete'), small: true, variant: 'danger', disabled, onClick: handlers.onDelete }),
    ]),
  ], [
    h('div', { className: 'dsk-row', style: { cursor: 'default' } },
      h('div', { className: 'dsk-row-main' },
        mutedOf('id: ' + server.id),
        server.args.length > 0 ? mutedOf(`${t('mcp.args')}: ${server.args.join(' ')}`) : null),
      h('div', { className: 'dsk-row-actions' },
        mutedOf(server.command === '' ? 'http' : 'stdio'))),
  ])
}
