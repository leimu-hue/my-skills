/**
 * 技能域视图：来源与技能的列表、开关、详情、新建 / 编辑、导入与回收站。
 *
 * 这里只剩「画」：状态与每个动作都在 `lib/use-skills.ts`，本文件负责把它们的返回值摆到
 * 页面上。真要改行为，去那个 hook；真要改一处文案或类名，才来这里。
 */
import type { ReactNode } from 'react'
import { useSkills } from '../../lib/skills/use-skills.ts'
import type { DomainProps } from '../../lib/core/domain.ts'
import { alertOf, badgeOf, emptyOf } from '../ui/atoms.tsx'
import { buttonOf, errorAlertOf, inputOf } from '../ui/controls.tsx'
import { headOf, listOf, toolbarOf } from '../ui/layout.tsx'
import { renderRoot } from './root.tsx'
import { renderDetail } from './detail.tsx'
import { renderForm } from './form.tsx'
import { renderImport } from './import.tsx'
import { renderTrash } from './trash.tsx'

export function SkillsView(props: DomainProps): ReactNode {
  const t = props.t
  const skills = useSkills(t, props.notify)
  const view = skills.view
  const counts = view?.counts
  const warnings = view?.warnings ?? []

  const badges: ReactNode[] = []
  if (counts !== undefined) {
    badges.push(badgeOf(t('page.counts', {
      total: counts.total,
      enabled: counts.enabled,
      disabled: counts.disabled,
      shadowed: counts.shadowed,
    })))
    badges.push(badgeOf(t('page.roots', { n: counts.sources })))
  }
  badges.push(badgeOf(t('page.globalScope'), 'off', t('page.scopeReserved')))
  if (view !== null) badges.push(badgeOf(t('page.duration', { ms: view.durationMs }), 'off'))
  if (skills.health !== null) badges.push(badgeOf('v' + skills.health.version, 'off'))

  const alerts: ReactNode[] = []
  if (view !== null && view.stateHealthy === false) alerts.push(alertOf(t('page.degraded')))
  if (warnings.length > 0) alerts.push(alertOf(warnings.join(' · ')))
  if (skills.error !== null) alerts.push(errorAlertOf(t, skills.error))

  return (
    <div className='dsk-view'>
      {headOf({ title: t('nav.title'), badges, subtitle: t('page.subtitle'), alerts })}

      {toolbarOf([
        inputOf({ className: 'dsk-search', placeholder: t('page.search'), value: skills.query, onChange: skills.setQuery }),
        buttonOf({ label: t('page.refresh'), disabled: skills.busy !== '', onClick: skills.reload }),
        buttonOf({ label: t('page.create'), variant: 'primary', disabled: skills.busy !== '', onClick: skills.openCreate }),
        buttonOf({ label: t('page.import'), disabled: skills.busy !== '', onClick: skills.openImport }),
        buttonOf({ label: t('page.export'), disabled: skills.busy !== '' || view === null, onClick: skills.exportAll }),
        buttonOf({ label: t('page.trash'), disabled: skills.busy !== '', onClick: skills.openTrash }),
      ])}

      {skills.loading
        ? emptyOf(t('page.loading'))
        : listOf((view?.roots ?? []).map((root) => renderRoot(t, root, {
          busy: skills.busy,
          rows: skills.rowsOf(root),
          onToggleSource: (enabled) => {
            void skills.toggleSource(root.key, root.label, enabled)
          },
          onToggleRemoved: (removed) => {
            void skills.toggleSourceRemoved(root.key, removed)
          },
          onToggleSkill: (row, enabled) => {
            void skills.toggleSkill(row.rootKey, row.name, row.declaredName, enabled)
          },
          onOpen: (row) => skills.openDetail(row.rootKey, row.name),
          collapsed: skills.collapsed[root.key] === true,
          onToggleCollapsed: () => skills.toggleCollapsed(root.key),
        })))}

      {skills.selected === null
        ? null
        : renderDetail(t, {
          selected: skills.selected,
          detail: skills.detail,
          busy: skills.busy,
          onClose: skills.closeDetail,
          onEdit: skills.editDetail,
          onDelete: skills.deleteDetail,
          onExport: skills.exportDetail,
          onVerify: skills.verifyDetail,
          onPrefer: skills.preferDetail,
        })}

      {skills.form === null
        ? null
        : renderForm(t, {
          form: skills.form,
          busy: skills.busy,
          onChange: skills.changeForm,
          onCancel: skills.cancelForm,
          onSave: skills.saveForm,
        })}

      {skills.importing === null
        ? null
        : renderImport(t, {
          state: skills.importing,
          target: skills.importTarget,
          busy: skills.busy,
          onClose: skills.closeImport,
          onPickFolder: skills.pickFolder,
          onPickZip: skills.pickZip,
          onToggle: skills.toggleCandidate,
          onToggleAll: skills.toggleAllCandidates,
          onConfirm: skills.confirmImport,
        })}

      {skills.trash === null
        ? null
        : renderTrash(t, {
          items: skills.trash,
          busy: skills.busy,
          onClose: skills.closeTrash,
          onRestore: skills.restore,
          onPurge: skills.purge,
          onEmpty: skills.emptyTrash,
        })}
    </div>
  )
}
