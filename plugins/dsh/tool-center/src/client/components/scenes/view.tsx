/**
 * 场景域视图：上半是**场景定义**（可复用），下半是**工作区各自选择用哪个**。
 *
 * 场景是被选择的，工作区是选择的人 —— 所以列表里没有「进入场景」按钮，也没有「未绑定
 * 工作区」这种半成品状态；改由每个工作区那一行去选。
 *
 * 会话级的再选择不在这里（面板没有会话上下文）：那是 `/scene` 与「新会话页」的活。
 */
import type { ReactNode } from 'react'
import type { DomainProps } from '../../lib/core/domain.ts'
import { useScenes } from '../../lib/scenes/use-scenes.ts'
import { alertOf, badgeOf, emptyOf, mutedOf, noteOf } from '../ui/atoms.tsx'
import { buttonOf, errorAlertOf, selectOf } from '../ui/controls.tsx'
import { actionsOf, groupActionsOf, groupOf, headOf, listOf, toolbarOf } from '../ui/layout.tsx'
import { renderDraft } from './draft.tsx'

export function ScenesView(props: DomainProps): ReactNode {
  const t = props.t
  const scenes = useScenes(t, props.notify)

  const badges: ReactNode[] = []
  if (scenes.scenes.length > 0) badges.push(badgeOf(String(scenes.scenes.length)))
  if (scenes.activeKeys.length > 0) {
    badges.push(badgeOf(`${t('scenes.workspacesUsing')} ${scenes.activeKeys.length}`, 'ok'))
  }
  if (scenes.sessionCount > 0) badges.push(badgeOf(`${t('scenes.sessionsUsing')} ${scenes.sessionCount}`, 'off'))

  return (
    <div className='dsk-root'>
      {headOf({
        title: t('scenes.title'),
        badges,
        subtitle: t('scenes.subtitle'),
        alerts: [
          scenes.warnings.length > 0 ? alertOf(scenes.warnings.join(' · ')) : null,
          scenes.error === null ? null : errorAlertOf(t, scenes.error),
        ],
      })}

      {toolbarOf([
        actionsOf([
          buttonOf({ label: t('scenes.new'), variant: 'primary', disabled: scenes.busy !== '', onClick: scenes.openNew }),
        ]),
      ])}

      {scenes.scenes.length === 0
        ? emptyOf(t('scenes.empty'))
        : listOf(scenes.scenes.map((scene) => {
          const usage = scenes.usageOf(scene)
          return groupOf(scene.name, [
            <span className='dsk-group-name' key='name'>{scene.name}</span>,
            scene.skills.length > 0 ? badgeOf(t('scenes.count.skills', { n: scene.skills.length }), 'off') : null,
            scene.mcp.length > 0 ? badgeOf(t('scenes.count.mcp', { n: scene.mcp.length }), 'off') : null,
            /* 说明跟在「技能 n / MCP n」后面当同一个信息块：单独占一行时看着像另一个场景。 */
            noteOf(scene.description),
            usage.workspaces > 0 ? badgeOf(t('scenes.usedByWorkspaces', { n: usage.workspaces }), 'ok') : null,
            usage.sessions > 0 ? badgeOf(t('scenes.usedBySessions', { n: usage.sessions }), 'off') : null,
            scene.prompt === null ? null : badgeOf(`${t('scenes.prompt')}: ${scene.prompt}`, 'off'),
            groupActionsOf([
              buttonOf({ label: t('scenes.edit'), small: true, disabled: scenes.busy !== '', onClick: () => scenes.openEdit(scene) }),
              buttonOf({
                label: t('scenes.delete'),
                small: true,
                variant: 'danger',
                disabled: scenes.busy !== '' || usage.workspaces > 0 || usage.sessions > 0,
                onClick: () => scenes.remove(scene),
              }),
            ]),
          ], [])
        }))}

      {/* ── 工作区各自选择用哪个场景（默认展开，可折叠并记住） ── */}
      <div className='dsk-section'>
        <div className='dsk-section-head'>
          <button
            type='button'
            className='dsk-section-toggle'
            aria-expanded={scenes.workspacesOpen}
            title={t('scenes.byWorkspaceHint')}
            onClick={scenes.toggleWorkspaces}
          >
            <span className='dsk-section-caret' aria-hidden='true'>{scenes.workspacesOpen ? '▾' : '▸'}</span>
            <span className='dsk-section-title'>{t('scenes.byWorkspace')}</span>
          </button>
          {badgeOf(
            t('scenes.boundCount', { n: scenes.boundCount, total: scenes.workspaces.length }),
            scenes.boundCount > 0 ? 'ok' : 'off',
          )}
        </div>
        {scenes.workspacesOpen
          ? (
            <>
              {mutedOf(t('scenes.byWorkspaceHint'))}
              {scenes.workspaces.length === 0
                ? mutedOf(t('scenes.noWorkspaces'))
                : (
                  <div className='dsk-rows'>
                    {scenes.workspaces.map((workspace) => (
                      <div className='dsk-row dsk-row-static' key={workspace.path}>
                        <div className='dsk-row-main'>
                          <div className='dsk-row-name'>{workspace.label}</div>
                          {mutedOf(workspace.path)}
                        </div>
                        {selectOf({
                          value: scenes.activeOf(workspace.path),
                          options: [
                            { value: '', label: t('scenes.workspaceNone') },
                            ...scenes.scenes.map((scene) => ({ value: scene.name, label: scene.name })),
                          ],
                          onChange: (next) => scenes.setWorkspaceScene(workspace.path, next === '' ? null : next),
                        })}
                      </div>
                    ))}
                  </div>
                )}
            </>
          )
          : null}
      </div>

      {scenes.draft === null
        ? null
        : renderDraft(t, {
          draft: scenes.draft,
          busy: scenes.busy,
          search: scenes.search,
          sources: scenes.sources,
          onChange: scenes.changeDraft,
          onSearch: scenes.setSearch,
          onCancel: scenes.cancelDraft,
          onSave: scenes.saveDraft,
        })}
    </div>
  )
}
