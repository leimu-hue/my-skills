/**
 * 技能列表：一个来源一组，组内逐条列技能。
 *
 * 排序与可见性全部来自 host 的视图（`skills` 已经按「赢家在前、声明名、rank」排好），
 * 这里只做「来源分组」与「搜索过滤」。
 */
import { h } from '../core/runtime.js'
import type { Translate } from '../i18n/index.js'
import type { RootView, SkillRow } from '../core/types.js'
import {
  badgeOf,
  buttonOf,
  emptyOf,
  groupActionsOf,
  groupLineOf,
  groupOf,
  groupPathOf,
  switchOf,
} from '../core/ui.js'

export interface RootHandlers {
  busy: string
  rows: SkillRow[]
  onToggleSource(enabled: boolean): void
  onToggleRemoved(removed: boolean): void
  onToggleSkill(row: SkillRow, enabled: boolean): void
  onOpen(row: SkillRow): void
}

export function renderRoot(t: Translate, root: RootView, handlers: RootHandlers): unknown {
  const actions = groupActionsOf([
    root.toggleable && root.project !== true
      ? switchOf({
        on: root.enabled,
        title: root.enabled ? t('row.enabled') : t('row.disabled'),
        disabled: handlers.busy !== '',
        onClick: () => handlers.onToggleSource(!root.enabled),
      })
      : null,
    removableRoot(root)
      ? buttonOf({
        label: t('root.remove'),
        small: true,
        disabled: handlers.busy !== '',
        onClick: () => handlers.onToggleRemoved(true),
      })
      : null,
  ])

  if (root.removed && root.skills.length === 0) {
    // 被移除的来源仍然列出来（好让它能被恢复），但不显示任何行。
    return groupOf(root.key, [
      h('span', { className: 'dsk-group-name' }, root.label),
      badgeOf(t('root.removed'), 'off'),
      badgeOf(t('root.rank', { rank: root.rank }), 'off'),
      groupActionsOf([buttonOf({
        label: t('root.restore'),
        small: true,
        onClick: () => handlers.onToggleRemoved(false),
      })]),
    ], [])
  }

  return groupOf(root.key, [
    // 第一行：名字 + 徽章 + 操作；路径单独一行 —— 路径一长就把按钮挤到第二行，看着像错位。
    groupLineOf(root.label, [
      badgeOf(root.hostScans ? t('root.hostScans') : t('root.pluginOnly'), root.hostScans ? 'ok' : undefined),
      badgeOf(t('root.rank', { rank: root.rank }), 'off'),
      badgeOf(t('root.count', { n: root.skills.length }), 'off'),
      root.writable ? badgeOf(t('root.writable'), 'ok') : badgeOf(t('root.readonly'), 'off'),
    ], actions),
    groupPathOf(root.path),
  ], [
    root.error === undefined ? null : h('div', { className: 'dsk-alert dsk-alert-err' }, root.error),
    handlers.rows.length === 0
      ? emptyOf(root.skills.length === 0 ? t('page.empty') : t('page.noMatch'))
      : h('div', { className: 'dsk-rows' }, handlers.rows.map((row) => renderRow(t, row, root, handlers))),
  ])
}

/** 默认技能目录只能停用，不能整体移除。 */
function removableRoot(root: RootView): boolean {
  return root.kind !== 'local' && root.kind !== 'import' && root.project !== true
}

function renderRow(
  t: Translate,
  row: SkillRow,
  root: RootView,
  handlers: RootHandlers,
): unknown {
  const on = row.policy.modelInvocable
  const marks: unknown[] = []
  if (row.preferred) marks.push(badgeOf(t('row.preferred'), 'ok'))
  if (row.shadowed) marks.push(badgeOf(t('row.shadowed', { root: row.shadowedBy?.rootLabel ?? '?' }), 'warn'))
  if (!row.policy.rootOn) marks.push(badgeOf(t('row.sourceOff'), 'off'))
  if (row.loadable === false) marks.push(badgeOf(t('row.invalid'), 'warn', row.problem ?? ''))
  if (row.loadable && row.policy.skillOn && !row.declaresModelInvocable) marks.push(badgeOf(t('row.manualOnly'), 'off'))
  if (row.nested) marks.push(badgeOf(t('row.nested'), 'off'))
  if (row.linked) marks.push(badgeOf(t('row.linked'), 'off'))
  if (root.writable === false) marks.push(badgeOf(t('row.readonly'), 'off'))

  return h('div', {
    className: 'dsk-row' + (on ? '' : ' dsk-row-off'),
    key: row.rootKey + '/' + row.name,
    onClick: () => handlers.onOpen(row),
  },
  h('div', { className: 'dsk-row-main' },
    h('div', { className: 'dsk-row-name' }, row.declaredName, ...marks),
    h('div', { className: 'dsk-row-desc' }, row.description === '' ? '—' : row.description)),
  h('div', { className: 'dsk-row-actions' },
    switchOf({
      on,
      title: on ? t('row.enabled') : t('row.disabled'),
      disabled: handlers.busy !== '' || row.loadable === false || row.shadowed,
      stopPropagation: true,
      onClick: () => handlers.onToggleSkill(row, !on),
    })))
}
