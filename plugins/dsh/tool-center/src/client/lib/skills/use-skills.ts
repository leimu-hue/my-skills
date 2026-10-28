/**
 * 技能域的全部逻辑：读一次视图、开关、详情、表单、导入、回收站。
 *
 * 几个刻意的选择，都是被替换插件留下的教训：
 *   * **不轮询。** 列表只在挂载时与每次变更后读一次；
 *   * **一次变更一个请求。** 每颗开关各发一条 op，不把状态攒在前端批量冲；
 *   * **宿主持有真值。** 写完重新读 `state`，而不是改本地副本。
 *
 * 组件目录里剩下的只有「这些东西画成什么样」——`components/skills/view.tsx` 调用它，
 * 拿到 state / 动作 / 弹层状态，不做任何判断。
 */
import { useEffect, useState } from 'react'
import { callOp, downloadBase64 } from '../core/api.ts'
import { useDomain, type DomainFailure } from '../core/domain.ts'
import { folderArchive, zipArchive } from './files.ts'
import { createTargetOf, importTargetOf, MAX_IMPORT_BYTES, visibleRowsOf } from './selectors.ts'
import { readJson, writeJson } from '../core/storage.ts'
import type {
  FileNote,
  Health,
  ImportCandidate,
  ImportOutcome,
  ImportState,
  RootView,
  SkillDetail,
  SkillFormState,
  SkillRow,
  SkillStateView,
  TrashItem,
} from '../core/types.ts'
import type { Translate } from '../../i18n/index.ts'

/** 折叠状态在 localStorage 里的键。 */
const COLLAPSED_KEY = 'tool-center:collapsed'

export interface SkillsController {
  view: SkillStateView | null
  busy: string
  error: DomainFailure | null
  health: Health | null
  /** 首屏还没拿到数据且正在读。 */
  loading: boolean

  query: string
  setQuery(value: string): void
  collapsed: Record<string, boolean>
  toggleCollapsed(key: string): void
  rowsOf(root: RootView): SkillRow[]

  /** 来源整体启停 / 不再读取 / 单条技能启停：回执文案都写在这里。 */
  toggleSource(rootKey: string, label: string, enabled: boolean): void
  toggleSourceRemoved(rootKey: string, removed: boolean): void
  toggleSkill(rootKey: string, name: string, declaredName: string, enabled: boolean): void

  reload(): void
  exportAll(): void

  selected: { root: string; name: string } | null
  detail: SkillDetail | null
  openDetail(root: string, name: string): void
  closeDetail(): void
  editDetail(): void
  deleteDetail(): void
  exportDetail(): void
  verifyDetail(): void
  preferDetail(preferred: boolean): void

  form: SkillFormState | null
  openCreate(): void
  changeForm(patch: Partial<SkillFormState>): void
  cancelForm(): void
  saveForm(): void

  importing: ImportState | null
  importTarget: RootView | undefined
  openImport(): void
  closeImport(): void
  pickFolder(files: File[]): void
  pickZip(file: File): void
  toggleCandidate(name: string): void
  toggleAllCandidates(selected: boolean): void
  confirmImport(): void

  trash: TrashItem[] | null
  openTrash(): void
  closeTrash(): void
  restore(item: TrashItem): void
  purge(item: TrashItem): void
  emptyTrash(): void
}

/** 一条空扫描结果：面板刚打开、还没选文件时的样子。 */
function emptyImport(source: string): ImportState {
  return { source, base64: null, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: null }
}

export function useSkills(t: Translate, notify: (message: string) => void): SkillsController {
  const domain = useDomain<SkillStateView>('state', notify)
  const view = domain.state
  const busy = domain.busy

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ root: string; name: string } | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [trash, setTrash] = useState<TrashItem[] | null>(null)
  const [form, setForm] = useState<SkillFormState | null>(null)
  const [importing, setImporting] = useState<ImportState | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  /* 折叠状态是本机的界面偏好，不是技能策略，所以只存 localStorage：换台机器不该跟着走。 */
  useEffect(() => {
    const saved = readJson<Record<string, boolean>>(COLLAPSED_KEY)
    if (saved !== null) setCollapsed(saved)
  }, [])

  useEffect(() => {
    void callOp<Health>('health', {}).then(setHealth).catch(() => undefined)
  }, [])

  const toggleCollapsed = (key: string): void => {
    setCollapsed((current) => {
      const next = { ...current }
      if (next[key] === true) delete next[key]
      else next[key] = true
      writeJson(COLLAPSED_KEY, next)
      return next
    })
  }

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
  useEffect(() => {
    if (selected === null) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const exportSelection = async (items: { root: string; name: string }[] | undefined): Promise<void> => {
    try {
      const result = await callOp<{ filename: string; base64: string; skills: number }>(
        'export-zip',
        items === undefined ? {} : { items },
      )
      downloadBase64(result.filename, result.base64)
      notify(t('toast.exported', { name: result.filename }))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  /**
   * 核验「关掉之后模型到底还看不看得见这条技能」。
   *
   * 面板上的开关只是我们的意图；真正的答案在宿主的合并目录里（`verify` op 去问 `snapshot`）。
   * 三种结果分别给出不同的回执：已不可见 / 仍可见（说明没关掉）/ 仅人工可用。
   */
  const verifySkill = async (name: string): Promise<void> => {
    try {
      const result = await callOp<{
        name: string
        inCatalog: boolean
        modelInvocable: boolean
        userInvocable: boolean
        provider?: string
      }>('verify', { name })
      if (!result.inCatalog) {
        notify(result.userInvocable ? t('toast.verifyManual', { name }) : t('toast.verifyOff', { name }))
        return
      }
      notify(result.modelInvocable
        ? t('toast.verifyOn', { name, provider: result.provider ?? '?' })
        : t('toast.verifyOff', { name }))
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  const openTrash = async (): Promise<void> => {
    try {
      const value = await callOp<{ items: TrashItem[] }>('trash-list', {})
      setTrash(value.items)
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  /** 先扫描（只读）再让人勾选：一次全导容易塞进一堆不想要的东西。 */
  const scanArchive = async (source: string, base64: string): Promise<void> => {
    const target = importTargetOf(view)
    if (target === undefined) return
    setImporting(emptyImport(source))
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
    if (importTargetOf(view) === undefined) return
    try {
      const archive = await folderArchive(files)
      if (archive.bytes > MAX_IMPORT_BYTES) {
        domain.fail(t('import.tooLarge'))
        return
      }
      await scanArchive(archive.source === '' ? t('import.folder') : archive.source, archive.base64)
    } catch (cause) {
      domain.fail(String((cause as Error)?.message ?? cause))
    }
  }

  /** 单个 ZIP 文件：直接上传扫描。 */
  const pickZip = async (file: File): Promise<void> => {
    try {
      await scanArchive(file.name, await zipArchive(file))
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

  const toggleAllCandidates = (selectedAll: boolean): void => {
    setImporting((current) => {
      if (current === null) return current
      return {
        ...current,
        picked: selectedAll ? current.candidates.filter((candidate) => !candidate.exists).map((candidate) => candidate.name) : [],
      }
    })
  }

  const saveForm = (): void => {
    if (form === null) return
    if (form.name.trim() === '' || form.description.trim() === '') {
      notify(t('form.required'))
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
  }

  return {
    view,
    busy,
    error: domain.error,
    health,
    loading: view === null && busy !== '',

    query,
    setQuery,
    collapsed,
    toggleCollapsed,
    rowsOf: (root) => visibleRowsOf(root, query),
    toggleSource: (rootKey, label, enabled) => {
      void domain.act('set-source', { root: rootKey, enabled }, enabled
        ? t('toast.sourceOn', { name: label })
        : t('toast.sourceOff', { name: label }))
    },
    toggleSourceRemoved: (rootKey, removed) => {
      void domain.act('remove-source', { root: rootKey, removed }, removed
        ? t('toast.rootRemoved')
        : t('toast.rootAdded'))
    },
    toggleSkill: (rootKey, name, declaredName, enabled) => {
      void domain.act('set-skill', { root: rootKey, name, enabled }, enabled
        ? t('toast.skillOn', { name: declaredName })
        : t('toast.skillOff', { name: declaredName }))
    },

    reload: () => { void domain.reload().then(() => notify(t('toast.refreshed'))) },
    exportAll: () => { void exportSelection(undefined) },

    selected,
    detail,
    openDetail: (root, name) => { void openDetail(root, name) },
    closeDetail,
    editDetail: () => {
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
    deleteDetail: () => {
      if (detail === null) return
      const row = detail.row
      void domain.act('remove', { root: row.rootKey, name: row.name }, t('toast.deleted')).then((done) => {
        if (done.ok) closeDetail()
      })
    },
    exportDetail: () => {
      if (detail === null) return
      void exportSelection([{ root: detail.row.rootKey, name: detail.row.name }])
    },
    verifyDetail: () => {
      if (detail === null) return
      void verifySkill(detail.row.declaredName)
    },
    preferDetail: (preferred) => {
      if (detail === null) return
      const row = detail.row
      void domain.act(
        'prefer',
        { root: row.rootKey, name: row.name, preferred },
        preferred ? t('toast.prefer') : t('toast.unprefer'),
      ).then(() => openDetail(row.rootKey, row.name))
    },

    form,
    openCreate: () => setForm({
      mode: 'create',
      root: createTargetOf(view)?.key ?? 'local',
      name: '',
      description: '',
      whenToUse: '',
      body: '',
    }),
    changeForm: (patch) => setForm((current) => (current === null ? current : { ...current, ...patch })),
    cancelForm: () => setForm(null),
    saveForm,

    importing,
    importTarget: importTargetOf(view),
    openImport: () => setImporting(emptyImport('')),
    closeImport: () => setImporting(null),
    pickFolder: (files) => { void pickFolder(files) },
    pickZip: (file) => { void pickZip(file) },
    toggleCandidate,
    toggleAllCandidates,
    confirmImport: () => { void confirmImport() },

    trash,
    openTrash: () => { void openTrash() },
    closeTrash: () => setTrash(null),
    restore: (item) => {
      void domain.act('trash-restore', { id: item.id }, t('toast.restored')).then(() => { void openTrash() })
    },
    purge: (item) => {
      if (!window.confirm(t('trash.confirmPurge', { name: item.declaredName }))) return
      void domain.act('trash-purge', { id: item.id }, t('toast.purged')).then(() => { void openTrash() })
    },
    emptyTrash: () => {
      if (!window.confirm(t('trash.confirmEmpty'))) return
      void domain.act('trash-empty', {}, t('toast.purged')).then(() => { void openTrash() })
    },
  }
}
