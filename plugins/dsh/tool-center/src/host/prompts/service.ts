/**
 * 提示词域：多套预设，**每份预设自带作用范围**，各自可启用 / 停用。
 *
 * 为什么作用范围属于预设而不是「页面顶部的全局开关」：你可能有一份「工作区 A 的规矩」和一份
 * 「工作区 B 的规矩」，它们同时存在、各自生效。把它做成页面级选择器，就变成「同一时刻只能看
 * 一个目标」，而预设本身反而没有身份。
 *
 * 落点：**追加一段系统提示词，从不碰 AGENTS.md。**
 *   * `AGENTS.md` 是用户自己的地盘（`dsh-agent-instructions` 读它）。早先「启用 = 覆盖
 *     AGENTS.md」的做法，用户手改一次、从 git 还原一次、甚至编辑器整文件保存一次，预设正文
 *     就跟着没了 —— 而界面上它仍然显示「正在生效」。这条静默失效的路现在不存在了；
 *   * 宿主的 `dsh-system-prompt` 允许插件注册有序区段（`ctx.systemPrompt.section`），区段
 *     正文在每次组装时现取，所以预设正文只存在于 `tool-center/prompts/<名字>.md` 一处，
 *     没有副本，也就没有「副本被改坏」这种状态；
 *   * 作用范围照样是真的：区段正文按**这个 agent 的工作区**现算 —— 全局预设追加给每个会话，
 *     工作区预设只追加给该目录（含子目录）里的会话。
 *
 * ⚠️ 生效时机说实话：系统提示词每一步都会重新组装，所以启用 / 停用 / 改正文会影响**已有会话的
 * 下一轮**；没有「只对新会话生效」这回事，本模块不假装能。
 *
 * 不变式（每个目标各自成立）：
 *   * 启用 / 停用 = **只改索引**，预设文件一直留着；同一目标上只允许一份预设生效
 *     （启用新的会自动停用旧的，旧的那份仍留在列表里，只是不再生效）；
 *   * 正文只有一个来源，不产生任何「落盘副本」，因此不需要备份，也没有漂移可比。
 */
import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { isInside, pathKey, writeFileAtomic } from '../shared/paths.ts'
import { DomainError, describe } from '../shared/result.ts'
import { exists, readTextOrNull } from '../shared/fs.ts'
import { isRecord } from '../shared/json.ts'

/** 应用目标：用户级全局，或某个工作区。 */
export type PromptTarget = { kind: 'global' } | { kind: 'workspace'; path: string; title?: string }

const GLOBAL_TARGET: PromptTarget = { kind: 'global' }

export interface PromptPreset {
  name: string
  content: string
  bytes: number
  updatedAt: number
  /** 这份预设的作用范围。 */
  scope: { kind: 'global' | 'workspace'; path: string; label: string }
  /** 是否正在生效。 */
  enabled: boolean
}

export interface AppliedRecord {
  key: string
  label: string
  preset: string
  at: number
}

export interface PromptState {
  presets: PromptPreset[]
  /** 当前生效的目标一览（一个目标最多一份预设）。 */
  applied: AppliedRecord[]
  warnings: string[]
}

interface PresetMeta {
  scope: { kind: 'global' | 'workspace'; path: string }
}

interface AppliedEntry {
  preset: string
  at: number
}

interface PromptIndex {
  version: 4
  /** 预设名 → 元数据（作用范围）。 */
  presets: Record<string, PresetMeta>
  /** 目标键 → 应用记录。 */
  applied: Record<string, AppliedEntry>
}

const INDEX_NAME = 'index.json'
const BACKUP_DIR = '__backup__'
const MAX_PRESET_BYTES = 512 * 1024
const PRESET_NAME = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 .-]{0,63}$/

export function promptsRootOf(dshHome: string): string {
  return join(dshHome, 'tool-center', 'prompts')
}

export function isValidPresetName(name: string): boolean {
  return PRESET_NAME.test(name) && name !== BACKUP_DIR && !name.startsWith('.')
}

export function digestOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32)
}

/**
 * 预设的启用 / 停用 / 正文变化。
 *
 * 为什么要一层监听而不是让调用方各自刷新：写入点有三处（面板 op、场景应用、`/scene`），
 * 而消费方只有一处（要追加进系统提示词的那份内存快照）。让写的一侧广播、读的一侧刷新，
 * 就不会出现「场景应用了预设、界面上写着生效，模型却看不见」。
 */
type PromptsChangedListener = () => void
const CHANGE_LISTENERS = new Set<PromptsChangedListener>()

export function onPromptsChanged(listener: PromptsChangedListener): () => void {
  CHANGE_LISTENERS.add(listener)
  return () => { CHANGE_LISTENERS.delete(listener) }
}

function notifyChanged(): void {
  for (const listener of [...CHANGE_LISTENERS]) {
    try {
      listener()
    } catch {
      /* 监听器自己的问题不该挡住写入 */
    }
  }
}

/** 把 op 传来的作用范围收成合法形状；缺省 = 全局。 */
function normaliseScope(input: unknown): { kind: 'global' | 'workspace'; path: string } {
  if (isRecord(input)) {
    const record = input as Record<string, unknown>
    const path = typeof record.path === 'string' ? record.path.trim() : ''
    if (record.kind === 'workspace' && path !== '') return { kind: 'workspace', path: resolve(path) }
  }
  return { kind: 'global', path: '' }
}

function targetOfScope(scope: { kind: 'global' | 'workspace'; path: string }, title?: string): PromptTarget {
  return scope.kind === 'global' ? GLOBAL_TARGET : { kind: 'workspace', path: scope.path, title }
}

function targetKeyOf(target: PromptTarget): string {
  return target.kind === 'global' ? 'global' : `ws:${target.path}`
}

function targetLabelOf(target: PromptTarget): string {
  if (target.kind === 'global') return '全局（所有会话）'
  return `${target.title ?? basename(target.path)}（${target.path}）`
}

function targetOfKey(key: string): PromptTarget {
  return key === 'global' ? GLOBAL_TARGET : { kind: 'workspace', path: key.slice(3) }
}

/** 旧版本写过的那个文件。现在只在迁移时读它。 */
function agentsPathOf(dshHome: string, target: PromptTarget = GLOBAL_TARGET): string {
  return target.kind === 'global' ? join(dshHome, 'AGENTS.md') : join(target.path, 'AGENTS.md')
}

function indexPathOf(dshHome: string): string {
  return join(promptsRootOf(dshHome), INDEX_NAME)
}

function backupDirOf(dshHome: string, target: PromptTarget): string {
  const slug = target.kind === 'global' ? 'global' : `ws-${digestOf(target.path).slice(0, 12)}`
  return join(promptsRootOf(dshHome), BACKUP_DIR, slug)
}

function presetPathOf(dshHome: string, name: string): string {
  return join(promptsRootOf(dshHome), `${name}.md`)
}

function emptyIndex(): PromptIndex {
  return { version: 4, presets: {}, applied: {} }
}

async function readIndex(dshHome: string): Promise<PromptIndex> {
  const raw = (await readTextOrNull(indexPathOf(dshHome))) ?? ''
  if (raw === '') return emptyIndex()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const index = emptyIndex()
    if (isRecord(parsed.presets)) {
      for (const [name, value] of Object.entries(parsed.presets as Record<string, unknown>)) {
        if (!isRecord(value)) continue
        index.presets[name] = { scope: normaliseScope((value as Record<string, unknown>).scope) }
      }
    }
    if (isRecord(parsed.applied)) {
      for (const [key, value] of Object.entries(parsed.applied as Record<string, unknown>)) {
        if (!isRecord(value)) continue
        const entry = value as Record<string, unknown>
        if (typeof entry.preset !== 'string' || entry.preset === '') continue
        // v3 的 digest / chainStart / agentsPath 已经没有意义，读到就丢。
        index.applied[key] = {
          preset: entry.preset,
          at: typeof entry.at === 'number' ? entry.at : Date.now(),
        }
      }
    }
    // 兼容 v1（单目标）与 v2（全局 + 目标选择器）的形状：把 old 的 applied 当作预设的作用范围。
    const legacyPreset = parsed.activePreset
    if (typeof legacyPreset === 'string' && legacyPreset !== '' && index.applied.global === undefined) {
      index.applied.global = {
        preset: legacyPreset,
        at: typeof parsed.appliedAt === 'number' ? parsed.appliedAt : Date.now(),
      }
      index.presets[legacyPreset] = { scope: { kind: 'global', path: '' } }
    }
    return index
  } catch {
    return emptyIndex()
  }
}

function writeIndex(dshHome: string, index: PromptIndex): Promise<void> {
  return writeFileAtomic(indexPathOf(dshHome), JSON.stringify(index, null, 2) + '\n')
}

/**
 * 一份预设在哪个目标上生效，以及那个目标当前生效的是哪份预设。
 *
 * 场景应用时要同时知道这两件事，所以一次索引读取把两个答案都给出来。
 */
export async function promptTargetOf(dshHome: string, name: string): Promise<{ targetKey: string; appliedPreset: string | null }> {
  const index = await readIndex(dshHome)
  const scope = index.presets[name]?.scope ?? { kind: 'global' as const, path: '' }
  const targetKey = targetKeyOf(targetOfScope(scope))
  return { targetKey, appliedPreset: index.applied[targetKey]?.preset ?? null }
}

/** 读全部预设（含各自的作用范围与是否生效）与目标一览。 */
export async function loadPrompts(dshHome: string): Promise<PromptState> {
  const warnings: string[] = []
  const index = await readIndex(dshHome)
  const root = promptsRootOf(dshHome)
  const names = await readdir(root).catch(() => [] as string[])
  const enabledByPreset = new Map<string, string>()
  for (const [key, entry] of Object.entries(index.applied)) enabledByPreset.set(entry.preset, key)

  const presets: PromptPreset[] = []
  for (const file of names) {
    if (!file.toLowerCase().endsWith('.md')) continue
    const name = file.slice(0, -3)
    if (!isValidPresetName(name)) continue
    const path = presetPathOf(dshHome, name)
    const info = await stat(path).catch(() => null)
    if (info === null || !info.isFile()) continue
    const content = (await readTextOrNull(path)) ?? ''
    const meta = index.presets[name] ?? { scope: { kind: 'global' as const, path: '' } }
    const target = targetOfScope(meta.scope)
    presets.push({
      name,
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
      updatedAt: info.mtimeMs,
      scope: {
        kind: meta.scope.kind,
        path: meta.scope.path,
        label: targetLabelOf(target),
      },
      enabled: enabledByPreset.has(name),
    })
  }
  // 固定用 en 归集排序：结果跨机器稳定（默认 locale 下中文与英文的相对顺序会随系统变）。
  presets.sort((left, right) => left.name.localeCompare(right.name, 'en'))

  const applied: AppliedRecord[] = []
  for (const [key, entry] of Object.entries(index.applied)) {
    const target = targetOfKey(key)
    if (!presets.some((preset) => preset.name === entry.preset)) {
      warnings.push(`「${entry.preset}」的预设文件已经不在了，这条生效记录不会追加任何内容`)
    }
    applied.push({ key, label: targetLabelOf(target), preset: entry.preset, at: entry.at })
  }
  applied.sort((left, right) => left.key.localeCompare(right.key, 'en'))

  return { presets, applied, warnings }
}

/** 新建或覆盖一份预设；`scope` 省略时保留原有作用范围（新预设默认全局）。 */
export async function savePreset(
  dshHome: string,
  name: string,
  content: string,
  scope?: unknown,
): Promise<{ name: string; created: boolean; scope: { kind: 'global' | 'workspace'; path: string } }> {
  if (!isValidPresetName(name)) {
    throw new DomainError('error.prompt.name', `预设名只能用中英文、数字、空格、点、连字符和下划线（最长 64）：${name}`)
  }
  if (typeof content !== 'string' || content.trim() === '') {
    throw new DomainError('error.prompt.empty', '预设内容不能为空')
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_PRESET_BYTES) {
    throw new DomainError('error.prompt.tooLarge', '预设内容超过 512 KiB')
  }
  await mkdir(promptsRootOf(dshHome), { recursive: true })
  const path = presetPathOf(dshHome, name)
  const existed = await exists(path)
  await writeFileAtomic(path, content)

  const index = await readIndex(dshHome)
  const next = scope === undefined ? (index.presets[name]?.scope ?? { kind: 'global' as const, path: '' }) : normaliseScope(scope)
  // 正在生效的预设被改范围时，先停用旧目标上的应用，避免「索引说 A、读的时候按 B 追加」。
  const activeKey = Object.entries(index.applied).find(([, entry]) => entry.preset === name)?.[0]
  if (activeKey !== undefined && activeKey !== targetKeyOf(targetOfScope(next))) {
    throw new DomainError('error.prompt.scopeLocked', '这份预设正在生效，先停用再改作用范围')
  }
  index.presets[name] = { scope: next }
  await writeIndex(dshHome, index)
  // 正文刚改过：正在生效的那份下一次组装就该用新正文。
  notifyChanged()
  return { name, created: !existed, scope: next }
}

export async function readPreset(dshHome: string, name: string): Promise<string> {
  const content = await readTextOrNull(presetPathOf(dshHome, name))
  if (content === null) throw new DomainError('error.prompt.notFound', `预设不存在：${name}`)
  return content
}

/** 删除一份预设。生效中的要先停用。 */
export async function deletePreset(dshHome: string, name: string): Promise<void> {
  const index = await readIndex(dshHome)
  const active = Object.entries(index.applied).find(([, entry]) => entry.preset === name)
  if (active !== undefined) {
    throw new DomainError('error.prompt.active', `「${name}」正在「${targetLabelOf(targetOfKey(active[0]))}」生效，先停用再删`)
  }
  const path = presetPathOf(dshHome, name)
  const present = await exists(path)
  if (!present) throw new DomainError('error.prompt.notFound', `预设不存在：${name}`)
  await unlink(path)
  delete index.presets[name]
  await writeIndex(dshHome, index)
  notifyChanged()
}

/**
 * 启用 / 停用一份预设。
 *
 * 只改索引 —— 不写任何用户文件。启用时若该目标上已有别的预设生效，会**先停用那一份**
 * （同一目标只允许一份生效：那个目标只有一条追加通道，两份同时「生效」是说不通的）。
 */
export async function setPresetEnabled(
  dshHome: string,
  name: string,
  enabled: boolean,
): Promise<{ name: string; enabled: boolean; changed: boolean; replaced: string | null; target: string }> {
  await readPreset(dshHome, name)
  const index = await readIndex(dshHome)
  const scope = index.presets[name]?.scope ?? { kind: 'global', path: '' }
  const target = targetOfScope(scope)
  const key = targetKeyOf(target)
  const current = Object.entries(index.applied).find(([, entry]) => entry.preset === name)

  if (!enabled) {
    if (current === undefined) return { name, enabled: false, changed: false, replaced: null, target: key }
    delete index.applied[current[0]]
    await writeIndex(dshHome, index)
    notifyChanged()
    return { name, enabled: false, changed: true, replaced: null, target: current[0] }
  }

  if (current !== undefined && current[0] === key) {
    return { name, enabled: true, changed: false, replaced: null, target: key }
  }

  // 这份预设若记在别的目标上（索引被手改过），先把那条摘掉，别留下两条生效记录。
  if (current !== undefined) delete index.applied[current[0]]

  let replaced: string | null = null
  const occupant = index.applied[key]
  if (occupant !== undefined && occupant.preset !== name) replaced = occupant.preset

  index.applied[key] = { preset: name, at: Date.now() }
  index.presets[name] = { scope }
  await writeIndex(dshHome, index)
  notifyChanged()
  return { name, enabled: true, changed: true, replaced, target: key }
}

/* --------------------------- 追加进系统提示词 --------------------------- */

/**
 * 一份「现在该追加什么」的内存快照。
 *
 * 为什么要快照：`ctx.systemPrompt.section()` 的正文函数是**同步**的（每次组装现调），读盘只能
 * 在别处做。所以写入时广播、启动时与文件变化时重建，正文函数只碰内存。
 */
export interface PromptSource {
  /** 这个工作区此刻该追加的正文：全局在前、工作区在后；没有就空串。 */
  textFor(workspace: string): string
  /** 从磁盘重建快照。 */
  refresh(): Promise<void>
}

interface PromptSnapshot {
  /** 全局预设的正文（'' = 没有全局预设生效）。 */
  global: string
  /** 生效中的工作区预设；`path` 是它的作用范围。 */
  workspaces: { path: string; content: string }[]
}

async function readSnapshot(dshHome: string): Promise<PromptSnapshot> {
  const index = await readIndex(dshHome)
  const snapshot: PromptSnapshot = { global: '', workspaces: [] }
  for (const [key, entry] of Object.entries(index.applied)) {
    const content = await readTextOrNull(presetPathOf(dshHome, entry.preset))
    if (content === null || content.trim() === '') continue
    const target = targetOfKey(key)
    if (target.kind === 'global') snapshot.global = content
    else snapshot.workspaces.push({ path: target.path, content })
  }
  return snapshot
}

export function createPromptSource(dshHome: string): PromptSource {
  let snapshot: PromptSnapshot = { global: '', workspaces: [] }
  return {
    textFor(workspace) {
      const parts: string[] = []
      // 每份正文各自修边：预设文件几乎都以换行结尾，直接拼会在区段里多出空行。
      if (snapshot.global.trim() !== '') parts.push(snapshot.global.trim())
      if (workspace !== '') {
        // 祖先链上每一份都算（与宿主读 AGENTS.md 的「由宽到严」一致），浅的先追加。
        const matched = snapshot.workspaces.filter((entry) => isInside(entry.path, workspace))
        matched.sort((left, right) => pathKey(left.path).length - pathKey(right.path).length)
        for (const entry of matched) parts.push(entry.content.trim())
      }
      return parts.join('\n\n')
    },
    async refresh() {
      snapshot = await readSnapshot(dshHome)
    },
  }
}

/* ------------------------------- 迁移 ------------------------------- */

/**
 * 旧版本（索引 v3）把预设正文**覆盖写进**了 `AGENTS.md`。现在改成追加系统提示词区段，
 * 那份副本要收回去，否则同一条指令会进两次。
 *
 * 克制条件：只处理「内容仍是当初写进去的那份」（指纹对得上）的目标。用户已经手改过的文件属于
 * 用户，一个字都不动，只报一条警告说明。恢复目标是当初的**链起点**（起点本来没有文件就删掉）。
 */
export async function migrateLegacyAppliedFiles(dshHome: string): Promise<string[]> {
  const warnings: string[] = []
  const raw = await readTextOrNull(indexPathOf(dshHome))
  if (raw === null) return warnings
  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value)) return warnings
    parsed = value
  } catch {
    return warnings
  }
  if (parsed.version !== 3) return warnings

  for (const [key, value] of Object.entries(isRecord(parsed.applied) ? parsed.applied as Record<string, unknown> : {})) {
    if (!isRecord(value)) continue
    const entry = value as Record<string, unknown>
    const target = targetOfKey(key)
    const agentsPath = typeof entry.agentsPath === 'string' && entry.agentsPath !== ''
      ? entry.agentsPath
      : agentsPathOf(dshHome, target)
    const content = await readTextOrNull(agentsPath)
    if (content === null) continue
    const digest = typeof entry.digest === 'string' ? entry.digest : ''
    if (digest !== '' && digest !== digestOf(content)) {
      warnings.push(`「${targetLabelOf(target)}」的 AGENTS.md 在应用之后被改过，保留原样不回滚（预设已改为追加系统提示词，不再需要那份副本）`)
      continue
    }
    const chainStart = typeof entry.chainStart === 'string' && entry.chainStart !== '' ? entry.chainStart : ''
    const start = chainStart === '' ? null : await readTextOrNull(join(backupDirOf(dshHome, target), chainStart))
    try {
      if (start !== null) await writeFileAtomic(agentsPath, start)
      else await rm(agentsPath, { force: true })
    } catch (error) {
      warnings.push(`把「${agentsPath}」恢复到旧版本覆盖之前的状态失败：${describe(error)}`)
    }
  }

  // 抬到 v4：之后 readIndex 不再看到那些 v3 字段。
  await writeIndex(dshHome, await readIndex(dshHome))
  notifyChanged()
  return warnings
}
