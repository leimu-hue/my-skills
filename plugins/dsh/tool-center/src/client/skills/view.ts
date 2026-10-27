/**
 * 技能域视图：来源与技能的列表、开关、详情面板、新建/编辑表单、导入导出与回收站。
 *
 * 几个刻意的选择，都是被替换插件留下的教训：
 *   * **不轮询。** 列表只在挂载时与每次变更后读一次；
 *   * **一次变更一个请求。** 每颗开关各发一条 op，不把状态攒在前端批量冲；
 *   * **宿主持有真值。** 写完重新读 `state`，而不是改本地副本。
 */
import { callOp, downloadBase64 } from '../core/api.js'
import { base64Of, buildZip } from '../core/zip.js'
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
import { renderImport, type FileNote, type ImportCandidate, type ImportOutcome, type ImportState } from './import.js'
import { renderTrash } from './trash.js'

/** 折叠状态在 localStorage 里的键。 */
const COLLAPSED_KEY = 'tool-center:collapsed'

/** 只有可写且没被移除的来源能接收新建 / 导入。 */
function writableRoots(view: SkillStateView | null): RootView[] {
  return (view?.roots ?? []).filter((root) => root.writable && !root.removed)
}

/**
 * 新建落点：固定在「DSH 技能」（用户的技能目录，宿主的 filesystem provider 也扫它）。
 * 早先给一个「导入技能 / DSH 技能」的下拉，但两个键名对用户没有意义 —— 新建就是放进自己的
 * 技能目录，导入才进插件的独立落点。
 */
function createTargetOf(view: SkillStateView | null): RootView | undefined {
  const candidates = writableRoots(view)
  return candidates.find((root) => root.key === 'local') ?? candidates[0]
}

/** 导入落点：固定在「导入技能」（这个插件自己的目录，rank 高于本地同名技能）。 */
function importTargetOf(view: SkillStateView | null): RootView | undefined {
  return (view?.roots ?? []).find((root) => root.key === 'import')
    ?? writableRoots(view)[0]
}

/** 一次导入的体积上限，与 host 的 `import-zip` 对齐。 */
const MAX_IMPORT_BYTES = 32 * 1024 * 1024

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
  const [collapsed, setCollapsed] = useStateOf<Record<string, boolean>>({})

  /* 折叠状态是本机的界面偏好，不是技能策略，所以只存 localStorage：换台机器不该跟着走。 */
  useClientEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY)
      if (raw === null) return
      const parsed = JSON.parse(raw) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setCollapsed(parsed as Record<string, boolean>)
      }
    } catch {
      /* 读不出来就全展开 */
    }
  }, [])

  const toggleCollapsed = (key: string): void => {
    setCollapsed((current) => {
      const next = { ...current }
      if (next[key] === true) delete next[key]
      else next[key] = true
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      } catch {
        /* 记不住也不影响本次会话 */
      }
      return next
    })
  }

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

  /* Esc 与「点遮罩」是同一个出口：不看提示也能关掉，不必先找到关闭按钮。 */
  useClientEffect(() => {
    if (selected === null) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

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

  /** 先扫描：把内容交给 host 的 `import-scan`（只读），拿到候选再让用户勾。 */
  const scanArchive = async (source: string, base64: string): Promise<void> => {
    const target = importTargetOf(view)
    if (target === undefined) return
    setImporting({ source, base64: null, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: null })
    const done = await domain.act('import-scan', { root: target.key, base64 })
    if (!done.ok) {
      setImporting(null)
      return
    }
    const scan = done.result as {
      candidates: ImportCandidate[]
      rejected: { name: string; reason: string }[]
      orphans: FileNote[]
      ignored: FileNote[]
    }
    setImporting({
      source,
      base64,
      candidates: scan.candidates,
      rejected: scan.rejected,
      orphans: scan.orphans ?? [],
      ignored: scan.ignored ?? [],
      // 默认勾上所有还能导入的（已存在的不勾、也不允许勾）。
      picked: scan.candidates.filter((candidate) => !candidate.exists).map((candidate) => candidate.name),
      result: null,
    })
  }

  /** 选文件夹：前端打成 ZIP（浏览器拿不到磁盘路径），再走扫描。 */
  const pickFolder = async (files: File[]): Promise<void> => {
    const target = importTargetOf(view)
    if (target === undefined) return
    try {
      const entries = await Promise.all(files.map(async (file) => ({
        name: relativeNameOf(file),
        data: new Uint8Array(await file.arrayBuffer()),
      })))
      const total = entries.reduce((sum, entry) => sum + entry.data.length, 0)
      if (total > MAX_IMPORT_BYTES) {
        domain.fail(t('import.tooLarge'))
        return
      }
      const source = relativeNameOf(files[0]).split('/')[0] || t('import.folder')
      await scanArchive(source, base64Of(buildZip(entries)))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  /** 单个 ZIP 文件：直接上传扫描。 */
  const pickZip = async (file: File): Promise<void> => {
    try {
      await scanArchive(file.name, base64Of(new Uint8Array(await file.arrayBuffer())))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  /** 勾完确认：只导入选中的那些。 */
  const confirmImport = async (): Promise<void> => {
    if (importing === null || importing.base64 === null) return
    const target = importTargetOf(view)
    if (target === undefined) return
    const done = await domain.act('import-zip', {
      root: target.key,
      base64: importing.base64,
      names: importing.picked,
    })
    if (!done.ok) return
    // 导入完清掉候选，面板改为展示结果（用户可以接着选下一个文件夹）。
    setImporting({ ...importing, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: done.result as ImportOutcome })
  }

  const toggleCandidate = (name: string): void => {
    setImporting((current) => {
      if (current === null) return current
      const picked = current.picked.includes(name)
        ? current.picked.filter((item) => item !== name)
        : [...current.picked, name]
      return { ...current, picked }
    })
  }

  const toggleAllCandidates = (selected: boolean): void => {
    setImporting((current) => {
      if (current === null) return current
      return { ...current, picked: selected ? current.candidates.filter((c) => !c.exists).map((c) => c.name) : [] }
    })
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
          root: createTargetOf(view)?.key ?? 'local',
          name: '',
          description: '',
          whenToUse: '',
          body: '',
        }),
      }),
      buttonOf({
        label: t('page.import'),
        disabled: busy !== '',
        onClick: () => setImporting({ source: '', base64: null, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: null }),
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
        collapsed: collapsed[root.key] === true,
        onToggleCollapsed: () => toggleCollapsed(root.key),
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
        target: importTargetOf(view),
        busy,
        onClose: () => setImporting(null),
        onPickFolder: (files) => { void pickFolder(files) },
        onPickZip: (file) => { void pickZip(file) },
        onToggle: toggleCandidate,
        onToggleAll: toggleAllCandidates,
        onConfirm: () => { void confirmImport() },
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

/** 文件夹选择给的是 `webkitRelativePath`（如 `my-skill/SKILL.md`），普通选择只有 name。 */
function relativeNameOf(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  const name = typeof relative === 'string' && relative !== '' ? relative : file.name
  return name.split('\\').join('/')
}