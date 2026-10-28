/**
 * MCP 域视图：服务器列表 + 启停 + 删除。
 *
 * 刻意不做「新增服务器」表单：启动命令属于用户的主机配置，插件替你拼一个错的命令，
 * 代价是宿主起不来 —— 新增仍然手写 patch，启停与删除交给这里。
 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { DomainProps } from '../../lib/core/domain.ts'
import { useMcp } from '../../lib/mcp/use-mcp.ts'
import type { McpServerRow } from '../../lib/core/types.ts'
import { alertOf, badgeOf, emptyOf, mutedOf } from '../ui/atoms.tsx'
import { buttonOf, errorAlertOf, switchOf } from '../ui/controls.tsx'
import { groupActionsOf, groupOf, headOf, listOf, toolbarOf } from '../ui/layout.tsx'

export function McpView(props: DomainProps): ReactNode {
  const t = props.t
  const mcp = useMcp(t, props.notify)

  const badges: ReactNode[] = []
  if (mcp.state !== null) {
    badges.push(badgeOf(t('mcp.servers', { n: mcp.servers.length })))
    badges.push(badgeOf(t('mcp.backups', { n: mcp.state.backupCount }), 'off'))
  }

  const alerts: ReactNode[] = [
    mcp.state !== null && mcp.state.patchExists === false ? alertOf(t('mcp.noPatch')) : null,
    mcp.warnings.length > 0 ? alertOf(mcp.warnings.join(' · ')) : null,
    mcp.error === null ? null : errorAlertOf(t, mcp.error),
  ]

  return (
    <div className='dsk-root'>
      {headOf({
        title: t('mcp.title'),
        badges,
        subtitle: t('mcp.subtitle'),
        muted: mcp.state === null ? undefined : `${t('mcp.patchPath')}: ${mcp.state.patchPath}`,
        alerts,
      })}

      {toolbarOf([
        buttonOf({ label: t('page.refresh'), disabled: mcp.busy !== '', onClick: mcp.reload }),
      ])}

      {mcp.servers.length === 0
        ? emptyOf(t('mcp.empty'))
        : listOf(mcp.servers.map((server) => renderServer(t, server, {
          busy: mcp.busy,
          onToggle: (enabled) => mcp.toggle(server, enabled),
          onDelete: () => mcp.remove(server),
        })))}
    </div>
  )
}

function renderServer(
  t: Translate,
  server: McpServerRow,
  handlers: { busy: string; onToggle(enabled: boolean): void; onDelete(): void },
): ReactNode {
  const command = server.command === '' ? server.url : [server.command, ...server.args].join(' ')
  const disabled = handlers.busy !== ''
  return groupOf(server.id, [
    <span className='dsk-group-name' key='name'>{server.name}</span>,
    badgeOf(server.transport),
    server.enabled ? badgeOf(t('mcp.enabled'), 'ok') : badgeOf(t('mcp.disabled'), 'off'),
    server.declaredAt === 'tool-center' ? badgeOf(t('mcp.overridden'), 'warn') : null,
    <span className='dsk-group-path' key='cmd' title={command}>{command}</span>,
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
    <div className='dsk-row' key='row' style={{ cursor: 'default' }}>
      <div className='dsk-row-main'>
        {mutedOf('id: ' + server.id)}
        {server.args.length > 0 ? mutedOf(`${t('mcp.args')}: ${server.args.join(' ')}`) : null}
      </div>
      <div className='dsk-row-actions'>
        {mutedOf(server.command === '' ? 'http' : 'stdio')}
      </div>
    </div>,
  ])
}
