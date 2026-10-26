/**
 * 技能域视图：来源与技能的列表、开关、详情面板、新建/编辑表单、导入导出与回收站。
 *
 * 几个刻意的选择，都是被替换插件留下的教训：
 *   * **不轮询。** 列表只在挂载时与每次变更后读一次；
 *   * **一次变更一个请求。** 批量开关走 `set-all`；
 *   * **宿主持有真值。** 写完重新读 `state`，而不是改本地副本。
 */
import { callOp, readFileAsBase64, downloadBase64 } from '../core/api.js'
import { h, useClientEffect, useStateOf } from '../core/runtime.js'
import type { DomainProps } from '../core/domain.js'
import { useDomain } from '../core/domain.js'
import type { Health, RootView, SkillDetail, SkillStateView, TrashItem } from '../core/types.js'
import {
  alertOf,
  badgeOf,
  buttonOf,
  emptyOf,
  errorAlertOf,
  headOf,
  inputOf,
  listOf,
  toolbarOf,
} from '../core/ui.js'
import { renderRoot } from './list.js'
import { renderDetail } from './detail.js'
import { renderForm, type FormState } from './form.js'
import { renderImport, type ImportOutcome, type ImportState } from './import.js'
import { renderTrash } from './trash.js'

/** 只有可写且没被移除的来源能接收新建 / 导入。 */
function writableRoots(view: SkillStateView | null): RootView[] {
  return (view?.roots ?? []).filter((root) => root.writable && !root.removed)
}

export function SkillsView(props: DomainProps): unknown {
  const t = props.t
  const domain = useDomain<SkillStateView>('state', props.notify)
  const view = domain.state
  const busy = domain.busy
  const [query, setQuery] = useStateOf('')
  const [selected, setSelected] = useStateOf<{ root: string; name: string } | null>(null)
  const [detail, setDetail] = useStateOf<SkillDetail | null>(null)
  const [trash, setTrash] = useStateOf<TrashItem[] | null>(null)
  const [form, setForm] = useStateOf<FormState | null>(null)
  const [importing, setImporting] = useStateOf<ImportState | null>(null)
  const [health, setHealth] = useStateOf<Health | null>(null)

  useClientEffect(() => {
    void callOp<Health>('health', {}).then((value) => setHealth(value)).catch(() => undefined)
  }, [])

  const openDetail = async (root: string, name: string): Promise<void> => {
    setSelected({ root, name })
    setDetail(null)
    try {
      setDetail(await callOp<SkillDetail>('detail', { root, name }))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  const closeDetail = (): void => {
    setSelected(null)
    setDetail(null)
  }

  const openTrash = async (): Promise<void> => {
    try {
      const value = await callOp<{ items: TrashItem[] }>('trash-list', {})
      setTrash(value.items)
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  const visibleRows = (root: RootView): typeof root.skills => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return root.skills
    return root.skills.filter((row) =>
      row.declaredName.toLowerCase().includes(needle)
      || row.name.toLowerCase().includes(needle)
      || row.description.toLowerCase().includes(needle))
  }

  const exportSelection = async (items: { root: string; name: string }[] | undefined): Promise<void> => {
    try {
      const result = await callOp<{ filename: string; base64: string; skills: number }>(
        'export-zip',
        items === undefined ? {} : { items },
      )
      downloadBase64(result.filename, result.base64)
      props.notify(t('toast.exported', { name: result.filename }))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  const counts = view?.counts
  const warnings = view?.warnings ?? []
  const badges: unknown[] = []
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
  if (health !== null) badges.push(badgeOf('v' + health.version, 'off'))

  const alerts: unknown[] = []
  if (view !== null && view.stateHealthy === false) alerts.push(alertOf(t('page.degraded')))
  if (warnings.length > 0) alerts.push(alertOf(warnings.join(' · ')))
  if (domain.error !== null) alerts.push(errorAlertOf(t, domain.error))

  return h('div', { className: 'dsk-view' },
    headOf({ title: t('nav.title'), badges, subtitle: t('page.subtitle'), alerts }),

    toolbarOf([
      inputOf({ className: 'dsk-search', placeholder: t('page.search'), value: query, onChange: setQuery }),
      buttonOf({
        label: t('page.refresh'),
        disabled: busy !== '',
        onClick: () => { void domain.reload().then(() => props.notify(t('toast.refreshed'))) },
      }),
      buttonOf({
        label: t('page.create'),
        variant: 'primary',
        disabled: busy !== '',
        onClick: () => setForm({
          mode: 'create',
          root: writableRoots(view)[0]?.key ?? 'local',
          name: '',
          description: '',
          whenToUse: '',
          body: '',
        }),
      }),
      buttonOf({
        label: t('page.import'),
        disabled: busy !== '',
        onClick: () => setImporting({ root: writableRoots(view)[0]?.key ?? 'import', path: '', result: null }),
      }),
      buttonOf({ label: t('page.export'), disabled: busy !== '' || view === null, onClick: () => { void exportSelection(undefined) } }),
      buttonOf({ label: t('page.trash'), disabled: busy !== '', onClick: () => { void openTrash() } }),
    ]),

    domain.state === null && busy !== ''
      ? emptyOf(t('page.loading'))
      : listOf((view?.roots ?? []).map((root) => renderRoot(t, root, {
        busy,
        rows: visibleRows(root),
        onToggleSource: (enabled) => { void domain.act('set-source', { root: root.key, enabled }) },
        onToggleRemoved: (removed) => {
          void domain.act('remove-source', { root: root.key, removed }, removed ? t('toast.rootRemoved') : t('toast.rootAdded'))
        },
        onToggleSkill: (row, enabled) => { void domain.act('set-skill', { root: row.rootKey, name: row.name, enabled }) },
        onOpen: (row) => { void openDetail(row.rootKey, row.name) },
      }))),

    selected === null
      ? null
      : renderDetail(t, {
        selected,
        detail,
        busy,
        onClose: closeDetail,
        onEdit: () => {
          if (detail === null) return
          setForm({
            mode: 'edit',
            root: detail.row.rootKey,
            name: detail.row.name,
            description: detail.row.description,
            whenToUse: detail.row.whenToUse ?? '',
            body: detail.body,
          })
        },
        onDelete: () => {
          if (detail === null) return
          const row = detail.row
          void domain.act('remove', { root: row.rootKey, name: row.name }, t('toast.deleted')).then((done) => {
            if (done.ok) closeDetail()
          })
        },
        onExport: () => {
          if (detail === null) return
          void exportSelection([{ root: detail.row.rootKey, name: detail.row.name }])
        },
        onPrefer: (preferred) => {
          if (detail === null) return
          const row = detail.row
          void domain.act(
            'prefer',
            { root: row.rootKey, name: row.name, preferred },
            preferred ? t('toast.prefer') : t('toast.unprefer'),
          ).then(() => openDetail(row.rootKey, row.name))
        },
      }),

    form === null
      ? null
      : renderForm(t, {
        form,
        roots: writableRoots(view),
        busy,
        onChange: (patch) => setForm({ ...form, ...patch }),
        onCancel: () => setForm(null),
        onSave: () => {
          if (form.name.trim() === '' || form.description.trim() === '') {
            props.notify(t('form.required'))
            return
          }
          const args = {
            root: form.root,
            name: form.mode === 'create' ? form.name.trim() : form.name,
            description: form.description.trim(),
            whenToUse: form.whenToUse.trim(),
            body: form.body,
          }
          const op = form.mode === 'create' ? 'create' : 'update'
          void domain.act(op, args, t('toast.saved')).then((done) => {
            if (!done.ok) return
            setForm(null)
            if (form.mode === 'edit') void openDetail(form.root, form.name)
          })
        },
      }),

    importing === null
      ? null
      : renderImport(t, {
        state: importing,
        roots: writableRoots(view),
        busy,
        onChange: (patch) => setImporting({ ...importing, ...patch }),
        onClose: () => setImporting(null),
        onImportPath: () => {
          if (importing.path.trim() === '') return
          void domain.act('import-path', { root: importing.root, path: importing.path.trim() }).then((done) => {
            if (done.ok) setImporting({ ...importing, result: done.result as ImportOutcome })
          })
        },
        onImportZip: async (file: File) => {
          try {
            const base64 = await readFileAsBase64(file)
            const done = await domain.act('import-zip', { root: importing.root, base64 })
            if (done.ok) setImporting({ ...importing, result: done.result as ImportOutcome })
          } catch (cause) {
            domain.fail(String((cause as Error)?.message ?? cause))
          }
        },
      }),

    trash === null
      ? null
      : renderTrash(t, {
        items: trash,
        busy,
        onClose: () => setTrash(null),
        onRestore: (item) => {
          void domain.act('trash-restore', { id: item.id }, t('toast.restored')).then(() => { void openTrash() })
        },
        onPurge: (item) => {
          if (!window.confirm(t('trash.confirmPurge', { name: item.declaredName }))) return
          void domain.act('trash-purge', { id: item.id }, t('toast.purged')).then(() => { void openTrash() })
        },
        onEmpty: () => {
          if (!window.confirm(t('trash.confirmEmpty'))) return
          void domain.act('trash-empty', {}, t('toast.purged')).then(() => { void openTrash() })
        },
      }))
}
