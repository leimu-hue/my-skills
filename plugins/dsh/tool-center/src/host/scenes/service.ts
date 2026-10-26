/**
 * 场景域：一个场景 = 一次「把这三样拨到一起」的命名组合 —— 启用的 MCP 服务器、启用的技能、
 * 以及要应用的提示词预设（可以指定只对某个工作区生效）。
 *
 * 语义（用户视角，而不是实现视角）：
 *   * 场景记的是**你要用什么**（白名单），不是「你要关什么」；
 *   * `exclusive`（默认开）= 整套切换：没选中的技能与服务器会被关掉。想只「加启用、不动其它」，
 *     把它关掉；
 *   * 应用前先**回滚上一个场景改过的东西**（按记录的「改之前是什么」逐项恢复），
 *     所以场景之间不会互相叠加成「越切越关」，也不会碰你自己手工关掉的技能。
 *
 * 没有「意图 / 运行态 / 租约」那套对账器：应用是一次有起点、有终点的同步操作，记下改了哪些、
 * 原来是什么，就足够精确回滚 —— 也就没有那个每秒自我触发的写循环。
 */
import { join } from 'node:path'
import type { SkillService } from '../skills/service.js'
import type { SkillRef } from '../shared/types.js'
import { allRows } from '../skills/view.js'
import { rowIdOf, skillRefsOf } from '../skills/policy.js'
import { loadMcp, setMcpEnabled } from '../mcp/service.js'
import { DomainError, describe } from '../shared/result.js'
import { isRecord } from '../shared/json.js'
import { loadPrompts, promptTargetOf, setPresetEnabled } from '../prompts/service.js'
import { readTextOrNull } from '../shared/fs.js'
import { writeFileAtomic } from '../shared/paths.js'

/** 场景里提示词的目标：全局，或某个工作区。 */
export interface ScenePromptTarget {
  scope: 'global' | 'workspace'
  workspace?: string
}

export interface Scene {
  name: string
  description: string
  /** 要**启用**的技能（白名单）。 */
  skills: SkillRef[]
  /** 要**启用**的 MCP 服务器 id（白名单）。 */
  mcp: string[]
  /** 要应用的提示词预设；null = 不碰提示词。 */
  prompt: string | null
  /** 提示词应用到哪：默认全局。 */
  promptTarget: ScenePromptTarget
  /** 整套切换：未选中的技能与服务器关掉。默认 true。 */
  exclusive: boolean
  createdAt: number
  updatedAt: number
}

/** 「应用时改过的东西 + 改之前的状态」，用于精确回滚。 */
interface AppliedSnapshot {
  scene: string
  at: number
  skills: { root: string; name: string; wasOn: boolean }[]
  mcp: { id: string; wasOn: boolean }[]
  /** 应用提示词之前，那个目标上是哪份预设（null = 当时没有）。 */
  promptBefore: { targetKey: string; previousPreset: string | null } | null
}

interface ScenesDocument {
  version: 2
  scenes: Scene[]
  active: string | null
  applied: AppliedSnapshot | null
}

export interface ScenesState {
  scenes: Scene[]
  active: string | null
  warnings: string[]
  path: string
}

/** 回滚统计（报告与「是否有变化」都用它）。 */
export interface Reverted {
  skills: number
  mcp: number
  prompt: boolean
}

export interface SceneApplyReport {
  scene: string
  changed: boolean
  reverted: Reverted
  applied: { skills: number; mcp: number; prompt: string | null }
  warnings: string[]
}

const SCENES_NAME = 'scenes.json'
const NO_REVERT: Reverted = { skills: 0, mcp: 0, prompt: false }

function scenesPathOf(dshHome: string): string {
  return join(dshHome, 'tool-center', SCENES_NAME)
}

function emptyDocument(): ScenesDocument {
  return { version: 2, scenes: [], active: null, applied: null }
}

function normaliseTargetInput(value: unknown): ScenePromptTarget {
  if (!isRecord(value)) return { scope: 'global' }
  const record = value as Record<string, unknown>
  const workspace = typeof record.workspace === 'string' ? record.workspace.trim() : ''
  if (record.scope === 'workspace' && workspace !== '') return { scope: 'workspace', workspace }
  return { scope: 'global' }
}

function normaliseSceneDocument(value: unknown): ScenesDocument {
  const document = emptyDocument()
  if (!isRecord(value)) return document
  const record = value as Record<string, unknown>
  if (Array.isArray(record.scenes)) {
    for (const item of record.scenes) {
      if (!isRecord(item)) continue
      const scene = item as Record<string, unknown>
      const name = typeof scene.name === 'string' ? scene.name.trim() : ''
      if (name === '') continue
      document.scenes.push({
        name,
        description: typeof scene.description === 'string' ? scene.description : '',
        skills: skillRefsOf(scene.skills),
        mcp: Array.isArray(scene.mcp) ? scene.mcp.filter((id): id is string => typeof id === 'string') : [],
        prompt: typeof scene.prompt === 'string' && scene.prompt !== '' ? scene.prompt : null,
        promptTarget: normaliseTargetInput(scene.promptTarget),
        // v1 的「关闭清单」语义没有 exclusive 字段；按白名单读进来后默认整套切换。
        exclusive: scene.exclusive !== false,
        createdAt: typeof scene.createdAt === 'number' ? scene.createdAt : Date.now(),
        updatedAt: typeof scene.updatedAt === 'number' ? scene.updatedAt : Date.now(),
      })
    }
  }
  document.active = typeof record.active === 'string' && record.active !== '' ? record.active : null
  if (isRecord(record.applied)) {
    const applied = record.applied as Record<string, unknown>
    const promptBefore = applied.promptBefore
    document.applied = {
      scene: typeof applied.scene === 'string' ? applied.scene : '',
      at: typeof applied.at === 'number' ? applied.at : Date.now(),
      skills: Array.isArray(applied.skills)
        ? applied.skills.filter((ref): ref is { root: string; name: string; wasOn: boolean } =>
          isRecord(ref)
          && typeof ref.root === 'string'
          && typeof ref.name === 'string'
          && typeof ref.wasOn === 'boolean')
        : [],
      mcp: Array.isArray(applied.mcp)
        ? applied.mcp.filter((entry): entry is { id: string; wasOn: boolean } =>
          isRecord(entry)
          && typeof entry.id === 'string'
          && typeof entry.wasOn === 'boolean')
        : [],
      // 旧文档用过 `key` / `preset` 两个名字，读的时候一并认下来。
      promptBefore: isRecord(promptBefore)
        ? {
          targetKey: String(
            (promptBefore as { targetKey?: unknown }).targetKey
            ?? (promptBefore as { key?: unknown }).key
            ?? 'global',
          ),
          previousPreset: typeof (promptBefore as { previousPreset?: unknown }).previousPreset === 'string'
            ? String((promptBefore as { previousPreset?: unknown }).previousPreset)
            : (typeof (promptBefore as { preset?: unknown }).preset === 'string'
              ? String((promptBefore as { preset?: unknown }).preset)
              : null),
        }
        : null,
    }
  }
  return document
}

/** 读场景文档；坏 JSON 不抛错，退成空文档并留一条告警。 */
async function readDocument(dshHome: string): Promise<{ document: ScenesDocument; warnings: string[] }> {
  const raw = await readTextOrNull(scenesPathOf(dshHome))
  if (raw === null || raw === '') return { document: emptyDocument(), warnings: [] }
  try {
    return { document: normaliseSceneDocument(JSON.parse(raw)), warnings: [] }
  } catch {
    return { document: emptyDocument(), warnings: ['场景文件不是合法 JSON，本次按空场景继续'] }
  }
}

async function writeDocument(dshHome: string, document: ScenesDocument): Promise<void> {
  await writeFileAtomic(scenesPathOf(dshHome), JSON.stringify(document, null, 2) + '\n')
}

export async function loadScenes(dshHome: string): Promise<ScenesState> {
  const { document, warnings } = await readDocument(dshHome)
  return { scenes: document.scenes, active: document.active, warnings, path: scenesPathOf(dshHome) }
}

export async function saveScene(dshHome: string, scene: {
  name: string
  description?: string
  skills?: SkillRef[]
  mcp?: string[]
  prompt?: string | null
  promptTarget?: unknown
  exclusive?: boolean
}): Promise<Scene> {
  const name = scene.name.trim()
  if (name === '') throw new DomainError('error.scene.name', '场景名不能为空')
  if (name.length > 64) throw new DomainError('error.scene.name', '场景名最多 64 个字符')
  const { document } = await readDocument(dshHome)
  const existing = document.scenes.find((item) => item.name === name)
  const now = Date.now()
  const saved: Scene = {
    name,
    description: scene.description ?? existing?.description ?? '',
    skills: scene.skills ?? existing?.skills ?? [],
    mcp: scene.mcp ?? existing?.mcp ?? [],
    prompt: scene.prompt === undefined ? (existing?.prompt ?? null) : scene.prompt,
    promptTarget: scene.promptTarget === undefined ? (existing?.promptTarget ?? { scope: 'global' }) : normaliseTargetInput(scene.promptTarget),
    exclusive: scene.exclusive === undefined ? (existing?.exclusive ?? true) : scene.exclusive === true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  document.scenes = [...document.scenes.filter((item) => item.name !== name), saved]
  await writeDocument(dshHome, document)
  return saved
}

export async function deleteScene(dshHome: string, name: string): Promise<void> {
  const { document } = await readDocument(dshHome)
  if (document.active === name) {
    throw new DomainError('error.scene.active', `「${name}」正在生效，先切到别的场景或退出再删`)
  }
  const before = document.scenes.length
  document.scenes = document.scenes.filter((item) => item.name !== name)
  if (document.scenes.length === before) throw new DomainError('error.scene.notFound', `场景不存在：${name}`)
  await writeDocument(dshHome, document)
}

/** 把快照里的东西恢复成「应用之前」的样子。 */
async function revertSnapshot(
  dshHome: string,
  service: SkillService,
  snapshot: AppliedSnapshot,
): Promise<{ reverted: Reverted; warnings: string[] }> {
  const reverted: Reverted = { skills: 0, mcp: 0, prompt: false }
  const warnings: string[] = []

  if (snapshot.skills.length > 0) {
    const restored = await service.restoreSkills(
      snapshot.skills.map((ref) => ({ root: ref.root, name: ref.name, enabled: ref.wasOn })),
    )
    if (restored.ok !== true) throw new DomainError('error.scene.restore', String(restored.error ?? '恢复技能失败'))
    reverted.skills = (restored.data as { updated?: number } | undefined)?.updated ?? 0
  }

  for (const entry of snapshot.mcp) {
    try {
      const result = await setMcpEnabled(dshHome, entry.id, entry.wasOn)
      if (result.changed) reverted.mcp += 1
    } catch (cause) {
      warnings.push(`恢复 MCP「${entry.id}」失败：${describe(cause)}`)
    }
  }

  if (snapshot.promptBefore !== null) {
    const before = snapshot.promptBefore
    try {
      // 先停用这个目标上当前生效的那份，再恢复成之前的（可能本来就没有）。
      const current = (await loadPrompts(dshHome)).applied.find((record) => record.key === before.targetKey)
      if (current !== undefined) await setPresetEnabled(dshHome, current.preset, false)
      if (before.previousPreset !== null) await setPresetEnabled(dshHome, before.previousPreset, true)
      reverted.prompt = true
    } catch (cause) {
      warnings.push(`恢复提示词失败：${describe(cause)}`)
    }
  }
  return { reverted, warnings }
}

/**
 * 应用一个场景：先按记录回滚上一个场景，再按白名单把这个场景拨上去。
 *
 * 顺序是「先回滚、后应用」：两个场景都启用同一台服务器时，回滚会先按旧状态恢复、应用再设成
 * 新状态，结果正确；反过来会把刚设好的又改掉。
 */
export async function applyScene(dshHome: string, service: SkillService, cwd: string | undefined, name: string): Promise<SceneApplyReport> {
  const { document } = await readDocument(dshHome)
  const scene = document.scenes.find((item) => item.name === name)
  if (scene === undefined) throw new DomainError('error.scene.notFound', `场景不存在：${name}`)
  const warnings: string[] = []

  // ① 回滚上一个场景（同一个场景重入时不必回滚自己）。
  let reverted: Reverted = NO_REVERT
  if (document.applied !== null && document.applied.scene !== name) {
    const undone = await revertSnapshot(dshHome, service, document.applied)
    reverted = undone.reverted
    warnings.push(...undone.warnings)
  }

  // ② 按白名单拨技能：算清要开 / 要关，然后各走一次批量写（不是一条一次写盘）。
  const rows = allRows(await service.view(cwd)).filter((row) => !row.shadowed && row.rootWritable)
  const selected = new Set(scene.skills.map((ref) => rowIdOf(ref.root, ref.name)))
  const toEnable: SkillRef[] = []
  const toDisable: SkillRef[] = []
  const touched: AppliedSnapshot['skills'] = []
  for (const row of rows) {
    const wasOn = row.policy.skillOn
    const wanted = selected.has(rowIdOf(row.rootKey, row.name)) ? true : (scene.exclusive ? false : wasOn)
    if (wanted === wasOn) continue
    touched.push({ root: row.rootKey, name: row.name, wasOn })
    if (wanted) toEnable.push({ root: row.rootKey, name: row.name })
    else toDisable.push({ root: row.rootKey, name: row.name })
  }
  if (toEnable.length > 0) await service.setAll(toEnable, true, cwd)
  if (toDisable.length > 0) await service.setAll(toDisable, false, cwd)
  const applied = { skills: toEnable.length + toDisable.length, mcp: 0, prompt: null as string | null }

  // ③ MCP 服务器：同样按白名单。
  const mcpState = await loadMcp(dshHome).catch(() => null)
  const touchedMcp: AppliedSnapshot['mcp'] = []
  if (mcpState !== null) {
    const wanted = new Set(scene.mcp)
    for (const server of mcpState.servers) {
      const target = wanted.has(server.id) ? true : (scene.exclusive ? false : server.enabled)
      if (target === server.enabled) continue
      try {
        const result = await setMcpEnabled(dshHome, server.id, target)
        if (!result.changed) continue
        touchedMcp.push({ id: server.id, wasOn: server.enabled })
        applied.mcp += 1
      } catch (cause) {
        warnings.push(`设置 MCP「${server.name}」失败：${describe(cause)}`)
      }
    }
  }

  // ④ 提示词：预设自带作用范围，所以这里只需知道「它落在哪个目标」，并记下那个目标原来是谁。
  let promptBefore: AppliedSnapshot['promptBefore'] = null
  if (scene.prompt !== null) {
    try {
      const { targetKey, appliedPreset } = await promptTargetOf(dshHome, scene.prompt)
      promptBefore = { targetKey, previousPreset: appliedPreset }
      const result = await setPresetEnabled(dshHome, scene.prompt, true)
      if (result.changed) applied.prompt = scene.prompt
    } catch (cause) {
      warnings.push(`应用提示词「${scene.prompt}」失败：${describe(cause)}`)
    }
  }

  document.active = name
  document.applied = { scene: name, at: Date.now(), skills: touched, mcp: touchedMcp, promptBefore }
  await writeDocument(dshHome, document)

  const changed = applied.skills > 0 || applied.mcp > 0 || applied.prompt !== null
    || reverted.skills > 0 || reverted.mcp > 0 || reverted.prompt
  return { scene: name, changed, reverted, applied, warnings }
}

/** 退出场景：按记录把上一个场景改过的东西恢复，并清空 active。 */
export async function exitScene(dshHome: string, service: SkillService): Promise<{ reverted: Reverted; warnings: string[] }> {
  const { document } = await readDocument(dshHome)
  let reverted: Reverted = NO_REVERT
  const warnings: string[] = []
  if (document.applied !== null) {
    const undone = await revertSnapshot(dshHome, service, document.applied)
    reverted = undone.reverted
    warnings.push(...undone.warnings)
  }
  document.active = null
  document.applied = null
  await writeDocument(dshHome, document)
  return { reverted, warnings }
}
