/**
 * 提示词域：多套预设，**每份预设自带作用范围**，各自可启用 / 停用。
 *
 * 为什么作用范围属于预设而不是「页面顶部的全局开关」：你可能有一份「工作区 A 的规矩」和一份
 * 「工作区 B 的规矩」，它们同时存在、各自生效。把它做成页面级选择器，就变成「同一时刻只能看
 * 一个目标」，而预设本身反而没有身份。
 *
 * 宿主的指令来源有两档（`dsh-agent-instructions`）：
 *   * **用户级全局** `$DSH_HOME/AGENTS.md` —— 每个会话都读；
 *   * **工作区级** `<项目>/AGENTS.md` —— 只对该项目里的会话生效。
 * 所以「绑定到工作区 A 的预设」天然不影响 B 项目和全局 —— 这就是隔离的真实边界。
 *
 * ⚠️ 生效时机说实话：宿主每个会话**每轮**都会重新对账这些文件，所以启用 / 停用 / 改正文，
 * 会影响**已有会话的下一轮**。文件方案做不到「只对新会话生效」；本模块不假装能。
 *
 * 不变式（每个目标各自成立）：
 *   * 启用 = 备份 → 覆盖该目标的 AGENTS.md → 记指纹；同一目标上只允许一份预设生效
 *     （启用新的会自动停用旧的，旧的那份仍留在列表里，只是不再生效）；
 *   * 停用 = 回到该目标的链起点（起点本来没有文件就删掉文件，而不是留一个空文件）；
 *   * 记内容指纹，外部手改能如实报出来；
 *   * 预设文件与「是否生效」都记在索引里，重装 / 重启都不丢。
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, rm, stat, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { writeFileAtomic } from '../shared/paths.ts'
import { DomainError } from '../shared/result.ts'
import { exists, readTextOrNull } from '../shared/fs.ts'
import { writeBackup, type BackupResult } from '../shared/backups.ts'
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
  agentsPath: string
  drifted: boolean
}

export interface PromptState {
  presets: PromptPreset[]
  /** 当前生效的目标一览（含目标路径与是否漂移）。 */
  applied: AppliedRecord[]
  /** 所有目标的备份份数合计。 */
  backupCount: number
  warnings: string[]
}

interface PresetMeta {
  scope: { kind: 'global' | 'workspace'; path: string }
}

interface AppliedEntry {
  preset: string
  digest: string
  at: number
  chainStart: string | null
  agentsPath: string
}

interface PromptIndex {
  version: 3
  /** 预设名 → 元数据（作用范围）。 */
  presets: Record<string, PresetMeta>
  /** 目标键 → 应用记录。 */
  applied: Record<string, AppliedEntry>
}

const INDEX_NAME = 'index.json'
const BACKUP_DIR = '__backup__'
const MAX_BACKUPS = 5
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

/** 某个目标的 AGENTS.md 路径：全局在 `$DSH_HOME`，工作区在项目根。 */
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
  return { version: 3, presets: {}, applied: {} }
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
        index.applied[key] = {
          preset: entry.preset,
          digest: typeof entry.digest === 'string' ? entry.digest : '',
          at: typeof entry.at === 'number' ? entry.at : Date.now(),
          chainStart: typeof entry.chainStart === 'string' ? entry.chainStart : null,
          agentsPath: typeof entry.agentsPath === 'string' ? entry.agentsPath : '',
        }
      }
    }
    // 兼容 v1（单目标）与 v2（全局 + 目标选择器）的形状：把 old 的 applied 当作预设的作用范围。
    const legacyPreset = parsed.activePreset
    if (typeof legacyPreset === 'string' && legacyPreset !== '' && index.applied.global === undefined) {
      index.applied.global = {
        preset: legacyPreset,
        digest: typeof parsed.appliedDigest === 'string' ? parsed.appliedDigest : '',
        at: typeof parsed.appliedAt === 'number' ? parsed.appliedAt : Date.now(),
        chainStart: typeof parsed.chainStart === 'string' ? parsed.chainStart : null,
        agentsPath: '',
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
 * 场景应用时要同时知道这两件事，所以一次索引读取把两个答案都给出来（早先是「读一次索引
 * 拿作用范围 + 再 loadPrompts 读一次拿应用记录」）。
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
  let backupCount = 0
  for (const [key, entry] of Object.entries(index.applied)) {
    const target = targetOfKey(key)
    const agentsPath = entry.agentsPath !== '' ? entry.agentsPath : agentsPathOf(dshHome, target)
    const content = await readTextOrNull(agentsPath)
    const drifted = content !== null && entry.digest !== '' && digestOf(content) !== entry.digest
    if (drifted) warnings.push(`「${targetLabelOf(target)}」上的 AGENTS.md 在上次应用之后被外部改过`)
    backupCount += (await readdir(backupDirOf(dshHome, target)).catch(() => [] as string[])).length
    applied.push({
      key,
      label: targetLabelOf(target),
      preset: entry.preset,
      at: entry.at,
      agentsPath,
      drifted,
    })
  }
  applied.sort((left, right) => left.key.localeCompare(right.key, 'en'))

  return { presets, applied, backupCount, warnings }
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
  // 正在生效的预设被改范围时，先停用旧目标上的应用，避免「索引说 A、文件在 B」。
  const activeKey = Object.entries(index.applied).find(([, entry]) => entry.preset === name)?.[0]
  if (activeKey !== undefined && activeKey !== targetKeyOf(targetOfScope(next))) {
    throw new DomainError('error.prompt.scopeLocked', '这份预设正在生效，先停用再改作用范围')
  }
  index.presets[name] = { scope: next }
  await writeIndex(dshHome, index)
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
}

async function backupAgents(dshHome: string, target: PromptTarget, label: string): Promise<BackupResult | null> {
  const agents = await readTextOrNull(agentsPathOf(dshHome, target))
  if (agents === null) return null
  return writeBackup({
    dir: backupDirOf(dshHome, target),
    baseName: `AGENTS.md.${label}`,
    content: agents,
    keep: MAX_BACKUPS,
    // 只淘汰「每次写之前」的备份；`AGENTS.md.start-*` 是链起点，必须一直留着。
    prunePrefix: 'AGENTS.md.before-',
    // 备份不参与在线读取，普通写就够（保持原来的 0600）。
    atomic: false,
  })
}

/** 把该目标恢复到链起点。 */
async function unapplyTarget(dshHome: string, target: PromptTarget): Promise<{ restored: 'file' | 'absent'; from: string | null }> {
  const index = await readIndex(dshHome)
  const key = targetKeyOf(target)
  const agentsPath = agentsPathOf(dshHome, target)
  const entry = index.applied[key]
  await backupAgents(dshHome, target, 'before-unapply')
  let restored: 'file' | 'absent' = 'absent'
  let from: string | null = null
  if (entry?.chainStart != null) {
    const content = await readTextOrNull(join(backupDirOf(dshHome, target), entry.chainStart))
    if (content !== null) {
      await writeFileAtomic(agentsPath, content)
      restored = 'file'
      from = entry.chainStart
    }
  }
  if (restored === 'absent') await rm(agentsPath, { force: true }).catch(() => undefined)
  delete index.applied[key]
  await writeIndex(dshHome, index)
  return { restored, from }
}

/**
 * 启用 / 停用一份预设。
 *
 * 启用时若该目标上已有别的预设生效，会**先停用那一份**（同一目标只允许一份生效）——
 * 那个目标上的 AGENTS.md 只有一个，两份同时「生效」是说不通的。
 */
export async function setPresetEnabled(
  dshHome: string,
  name: string,
  enabled: boolean,
): Promise<{ name: string; enabled: boolean; changed: boolean; replaced: string | null; target: string }> {
  const content = await readPreset(dshHome, name)
  const index = await readIndex(dshHome)
  const scope = index.presets[name]?.scope ?? { kind: 'global', path: '' }
  const target = targetOfScope(scope)
  const key = targetKeyOf(target)
  const current = Object.entries(index.applied).find(([, entry]) => entry.preset === name)

  if (!enabled) {
    if (current === undefined) return { name, enabled: false, changed: false, replaced: null, target: key }
    await unapplyTarget(dshHome, targetOfKey(current[0]))
    return { name, enabled: false, changed: true, replaced: null, target: current[0] }
  }

  if (current !== undefined && current[0] === key) {
    return { name, enabled: true, changed: false, replaced: null, target: key }
  }

  // 同一目标上的另一份先停用。
  let replaced: string | null = null
  const occupant = index.applied[key]
  if (occupant !== undefined && occupant.preset !== name) {
    replaced = occupant.preset
    await unapplyTarget(dshHome, target)
  }

  const agentsPath = agentsPathOf(dshHome, target)
  const dir = backupDirOf(dshHome, target)
  const backup = await backupAgents(dshHome, target, 'before-apply')
  const fresh = await readIndex(dshHome)
  const previous = fresh.applied[key]
  const chainStart = previous?.chainStart ?? backup?.fileName ?? null
  if (previous === undefined && backup !== null) {
    // 链起点只在「这个目标第一次被应用」时留一条。
    await copyFile(join(dir, backup.fileName), join(dir, `AGENTS.md.start-${backup.stamp}`))
      .catch(() => undefined)
  }
  await writeFileAtomic(agentsPath, content)
  fresh.applied[key] = { preset: name, digest: digestOf(content), at: Date.now(), chainStart, agentsPath }
  fresh.presets[name] = { scope }
  await writeIndex(dshHome, fresh)
  return { name, enabled: true, changed: true, replaced, target: key }
}
