/**
 * 场景域：场景是**可复用的定义**，不是某个工作区的私有物。
 *
 *   * 一个场景 = 一批要启用的技能 + 要保留的 MCP 服务器 + 一份提示词预设（+ 是否整套切换）；
 *   * **每个工作区自己决定用不用它**（`active[工作区] = 场景名`），同一个场景可以被多个
 *     工作区同时启用；
 *   * **每个会话还能再选一次**（`sessions[根会话 id]`）：跟随工作区 / 指定某个场景 /
 *     明确不用。会话层是**整层替代**，不是叠加。
 *
 * 生效方式（这是它敢这么做的前提）：
 *   * 技能写进**作用域层**（`state.layers.workspaces['<工作区>']` 与
 *     `state.layers.sessions['<根会话>']`），全局策略一个字节都不改；
 *   * MCP 不改配置，只按会话遮工具（见 `scenes/gate.ts`）；
 *   * 提示词按预设自己的作用范围落地 —— 只认绑定该工作区的预设。**提示词没有会话级**：
 *     `AGENTS.md` 是文件、宿主按目录读，按会话开关不了；所以会话选择只覆盖技能与 MCP 工具。
 *
 * 层是**物化**的（写进状态文件），所以场景定义、工作区映射或会话选择一变就要重新物化
 * （`reconcileSessionLayers`），否则会话会停在旧场景上。
 */
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { SkillService } from '../skills/service.ts'
import type { SkillLayer, SkillRef, SkillRow } from '../shared/types.ts'
import { allRows } from '../skills/view.ts'
import { rowMatchesRef, skillRefsOf } from '../skills/policy.ts'
import { loadMcp } from '../mcp/service.ts'
import { DomainError, describe } from '../shared/result.ts'
import { isRecord } from '../shared/json.ts'
import { loadPrompts, promptTargetOf, readPreset, setPresetEnabled } from '../prompts/service.ts'
import { readTextOrNull } from '../shared/fs.ts'
import { samePath, writeFileAtomic } from '../shared/paths.ts'

export interface Scene {
  name: string
  description: string
  /** 要**启用**的技能（白名单）。 */
  skills: SkillRef[]
  /** 要保留的 MCP 服务器 id（其余服务器的工具在该场景里被遮掉）。 */
  mcp: string[]
  /** 要应用的提示词预设；null = 不碰提示词。 */
  prompt: string | null
  /** 整套切换：该作用域里未选中的技能挡掉。默认 true。 */
  exclusive: boolean
  createdAt: number
  updatedAt: number
}

/** 一个会话自己的选择。`scene: null` = 明确不用（压过工作区默认）。 */
export interface SessionChoice {
  scene: string | null
  /** 选的时候所在的工作区（重新物化层时要用它算行）。 */
  workspace: string
  at: number
}

/**
 * 「下一场会话该用哪个场景」的意图。
 *
 * 为什么需要它：新会话页上的那个选择器拿到的是**草稿会话 id** —— 宿主在真正发送时才会
 * 建立对话，草稿页的 id 往往就废了（日志里能直接看到：选了场景的那条会话只有一行 header，
 * 真正跑对话的是另一个 id）。只写会话层的话，这次选择会静静地失效。所以选择器那一侧多写
 * 一条「本工作区的下一场会话」，等真有会话在同一个工作区里开始读技能时再认领（adopt）。
 */
export interface PendingChoice {
  scene: string | null
  /** 当初写这条意图的会话 id（可能永远不会成为真正的对话）。 */
  from: string
  at: number
}

/** 进入场景时提示词那一步改了什么，用于退出 / 换场景时恢复。 */
interface PromptSnapshot {
  targetKey: string
  previousPreset: string | null
}

interface AppliedSnapshot {
  scene: string
  at: number
  promptBefore: PromptSnapshot | null
}

interface ScenesDocument {
  version: 4
  scenes: Scene[]
  /** 工作区路径 → 该工作区默认用哪个场景。 */
  active: Record<string, string>
  /** 根会话 id → 这个会话自己的选择。 */
  sessions: Record<string, SessionChoice>
  /** 工作区 → 「下一场会话」的意图（新会话页上的选择）。 */
  pending: Record<string, PendingChoice>
  /** 工作区 → 提示词快照（只有提示词需要回滚；技能层整层替换 / 删除）。 */
  applied: Record<string, AppliedSnapshot>
}

export interface ScenesState {
  scenes: Scene[]
  active: Record<string, string>
  sessions: Record<string, SessionChoice>
  pending: Record<string, PendingChoice>
  warnings: string[]
  path: string
}

export interface SceneApplyReport {
  scene: string | null
  workspace: string
  session: string | null
  changed: boolean
  /** 被替换掉的上一个场景。 */
  replaced: string | null
  applied: { skills: number; mcp: number; prompt: string | null }
  warnings: string[]
}

const SCENES_NAME = 'scenes.json'
const WS_PREFIX = 'ws:'
const SS_PREFIX = 'ss:'

/**
 * 「下一场会话」意图的有效期。
 *
 * 没有它，一小时前在新会话页上随手点的那一下会一直管着今天所有的会话；有它，就只影响
 * 「刚选完就开始的那场」。半小时足够覆盖「选完→打字→发送」。
 */
const PENDING_TTL_MS = 30 * 60 * 1000

const scenesPathOf = (dshHome: string): string => join(dshHome, 'tool-center', SCENES_NAME)

function emptyDocument(): ScenesDocument {
  return { version: 4, scenes: [], active: {}, sessions: {}, pending: {}, applied: {} }
}

/**
 * 工作区路径的规范写法：绝对路径、去尾部分隔符。不改变大小写（它也是界面标签的一部分）。
 */
export function normaliseWorkspace(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (!isAbsolute(trimmed)) return ''
  const resolved = resolve(trimmed)
  return resolved.length > 1 && resolved.endsWith(sep) ? resolved.slice(0, -1) : resolved
}


/**
 * 场景里的服务器引用能不能对上这一台。
 *
 * 场景存的是 patch 行的 `id`，但手写 / 迁移来的数据可能写 `serverName` —— 两个都认，
 * 且只在这一处认：`mcpNotes`（声明 / 停用检查）与工具闸门必须用同一条规则，否则会被
 * 「勾了但没生效 / 没勾却没被遮」这种自相矛盾咬到。
 */
export function serverMatches(server: { id: string; serverName: string }, wanted: string): boolean {
  return server.id === wanted || (server.serverName !== '' && server.serverName === wanted)
}

function normaliseScene(raw: Record<string, unknown>): Scene | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return null
  return {
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    skills: skillRefsOf(raw.skills),
    mcp: Array.isArray(raw.mcp) ? raw.mcp.filter((id): id is string => typeof id === 'string') : [],
    prompt: typeof raw.prompt === 'string' && raw.prompt !== '' ? raw.prompt : null,
    // v1 的「关闭清单」语义没有 exclusive 字段；按白名单读进来后默认整套切换。
    exclusive: raw.exclusive !== false,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function normaliseDocument(value: unknown): ScenesDocument {
  const document = emptyDocument()
  if (!isRecord(value)) return document
  const record = value as Record<string, unknown>

  if (Array.isArray(record.scenes)) {
    for (const item of record.scenes) {
      if (!isRecord(item)) continue
      const scene = normaliseScene(item as Record<string, unknown>)
      if (scene !== null) document.scenes.push(scene)
    }
  }
  const byName = new Map(document.scenes.map((scene) => [scene.name, scene] as const))

  if (isRecord(record.active)) {
    for (const [workspace, scene] of Object.entries(record.active)) {
      if (typeof scene !== 'string' || scene === '') continue
      const key = normaliseWorkspace(workspace)
      if (key === '' || !byName.has(scene)) continue
      document.active[key] = scene
    }
  }

  if (isRecord(record.sessions)) {
    for (const [sessionId, choice] of Object.entries(record.sessions)) {
      if (sessionId === '' || !isRecord(choice)) continue
      const entry = choice as Record<string, unknown>
      const scene = typeof entry.scene === 'string' && entry.scene !== '' ? entry.scene : null
      if (scene !== null && !byName.has(scene)) continue
      document.sessions[sessionId] = {
        scene,
        workspace: typeof entry.workspace === 'string' ? normaliseWorkspace(entry.workspace) : '',
        at: typeof entry.at === 'number' ? entry.at : Date.now(),
      }
    }
  }

  if (isRecord(record.pending)) {
    for (const [workspace, choice] of Object.entries(record.pending)) {
      const key = normaliseWorkspace(workspace)
      if (key === '' || !isRecord(choice)) continue
      const entry = choice as Record<string, unknown>
      const scene = typeof entry.scene === 'string' && entry.scene !== '' ? entry.scene : null
      if (scene !== null && !byName.has(scene)) continue
      document.pending[key] = {
        scene,
        from: typeof entry.from === 'string' ? entry.from : '',
        at: typeof entry.at === 'number' ? entry.at : Date.now(),
      }
    }
  }

  // v3：场景自己带 workspace（一个场景锁死一个项目）。迁移成「那个工作区的默认场景」。
  if (record.version === 3 && Array.isArray(record.scenes)) {
    for (const item of record.scenes) {
      if (!isRecord(item)) continue
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const legacy = typeof item.workspace === 'string' ? normaliseWorkspace(item.workspace) : ''
      if (name === '' || legacy === '' || !byName.has(name)) continue
      if (document.active[legacy] === undefined) document.active[legacy] = name
    }
  }

  if (isRecord(record.applied)) {
    for (const [workspace, snapshot] of Object.entries(record.applied)) {
      const key = normaliseWorkspace(workspace)
      if (key === '' || !isRecord(snapshot)) continue
      const entry = snapshot as Record<string, unknown>
      const promptBefore = entry.promptBefore
      document.applied[key] = {
        scene: typeof entry.scene === 'string' ? entry.scene : '',
        at: typeof entry.at === 'number' ? entry.at : Date.now(),
        promptBefore: isRecord(promptBefore)
          ? {
            targetKey: String((promptBefore as Record<string, unknown>).targetKey ?? 'global'),
            previousPreset: typeof (promptBefore as Record<string, unknown>).previousPreset === 'string'
              ? String((promptBefore as Record<string, unknown>).previousPreset)
              : null,
          }
          : null,
      }
    }
  }
  return document
}

/** 读场景文档；坏 JSON 不抛错，退成空文档并留一条告警。 */
async function readDocument(dshHome: string): Promise<{ document: ScenesDocument; warnings: string[] }> {
  const raw = await readTextOrNull(scenesPathOf(dshHome))
  if (raw === null || raw === '') return { document: emptyDocument(), warnings: [] }
  try {
    return { document: normaliseDocument(JSON.parse(raw)), warnings: [] }
  } catch {
    return { document: emptyDocument(), warnings: ['场景文件不是合法 JSON，本次按空场景继续'] }
  }
}

async function writeDocument(dshHome: string, document: ScenesDocument): Promise<void> {
  await writeFileAtomic(scenesPathOf(dshHome), JSON.stringify(document, null, 2) + '\n')
}

export async function loadScenes(dshHome: string): Promise<ScenesState> {
  const { document, warnings } = await readDocument(dshHome)
  return {
    scenes: document.scenes,
    active: document.active,
    sessions: document.sessions,
    pending: document.pending,
    warnings,
    path: scenesPathOf(dshHome),
  }
}

/**
 * 在一张「工作区 → 值」的表里找出这个工作区已有的键。
 *
 * 为什么不能直接 `table[workspace]`：键是写盘时的原样路径（保留大小写），而宿主的登记表
 * 与不同入口给的路径大小写可能不同 —— Windows 上 `D:\Repo` 与 `d:\repo` 是同一个目录，
 * 直接拿字符串当键会存出两条互相不认识的记录。比较统一走 `samePath`（resolve + 平台大小写）。
 */
function keyOfWorkspace(table: Record<string, unknown>, workspace: string): string | undefined {
  const target = normaliseWorkspace(workspace)
  if (target === '') return undefined
  return Object.keys(table).find((key) => samePath(key, target))
}

/** 这个工作区里默认用哪个场景。 */
export function workspaceSceneOf(state: ScenesState, workspace: string): string | null {
  const key = keyOfWorkspace(state.active, workspace)
  return key === undefined ? null : (state.active[key] ?? null)
}

/**
 * 某个会话最终用哪个场景，以及这个答案是谁给的。
 *
 * 会话自己的选择优先（`null` = 明确不用）；没有选择时跟随工作区；两者都没有就是不用。
 */
export function effectiveSceneOf(
  state: ScenesState,
  workspace: string,
  sessionId?: string,
): { name: string | null; source: 'session' | 'workspace' | 'none' } {
  if (typeof sessionId === 'string' && sessionId !== '') {
    const choice = state.sessions[sessionId]
    if (choice !== undefined) return { name: choice.scene, source: 'session' }
  }
  const name = workspaceSceneOf(state, workspace)
  return name === null ? { name: null, source: 'none' } : { name, source: 'workspace' }
}

export async function saveScene(dshHome: string, scene: {
  name: string
  description?: string
  skills?: SkillRef[]
  mcp?: string[]
  prompt?: string | null
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
  const usedBy = Object.entries(document.active).find(([, scene]) => scene === name)
  if (usedBy !== undefined) {
    throw new DomainError('error.scene.inUse', `「${name}」正在工作区 ${usedBy[0]} 使用，先在那里换成别的场景`)
  }
  const usedBySession = Object.entries(document.sessions).find(([, choice]) => choice.scene === name)
  if (usedBySession !== undefined) {
    throw new DomainError('error.scene.inUse', `会话 ${usedBySession[0]} 正在使用「${name}」，先退出再删`)
  }
  const before = document.scenes.length
  document.scenes = document.scenes.filter((item) => item.name !== name)
  if (document.scenes.length === before) throw new DomainError('error.scene.notFound', `场景不存在：${name}`)
  await writeDocument(dshHome, document)
}

/**
 * 把场景的白名单翻成一层技能策略，并告诉调用方真正命中了多少条。
 *
 * 整套切换用**白名单模式**（`whitelist: true`），而不是把未选中的名字逐条写进
 * `hiddenSkills`：后者等于给场景拍一张快照，之后新装的技能会悄悄漏进场景；白名单是规则。
 */
export function layerOf(scene: Scene, rows: SkillRow[]): { layer: SkillLayer | null; hitCount: number } {
  const enabledSkills: Record<string, string[]> = {}
  let hitCount = 0
  for (const row of rows) {
    if (row.shadowed) continue
    if (!scene.skills.some((ref) => rowMatchesRef(row, ref))) continue
    ;(enabledSkills[row.rootKey] ??= []).push(row.name)
    hitCount += 1
  }
  const layer: SkillLayer = {}
  if (Object.keys(enabledSkills).length > 0) layer.enabledSkills = enabledSkills
  if (scene.exclusive) layer.whitelist = true
  if (Object.keys(layer).length === 0) return { layer: null, hitCount }
  return { layer, hitCount }
}

/** 「明确不用」在技能层的表示：整层白名单但一条都不留。 */
const NOTHING_LAYER: SkillLayer = { whitelist: true }

/** 这个工作区的技能行（按工作区作用域算，不受会话层影响）。 */
async function rowsOf(service: SkillService, workspace: string): Promise<SkillRow[]> {
  return allRows(await service.view(workspace, `${WS_PREFIX}${workspace}`))
}

/** 算某个场景在某个工作区该物化成哪一层。 */
async function layerFor(
  dshHome: string,
  service: SkillService,
  workspace: string,
  sceneName: string,
): Promise<SkillLayer | null> {
  const { document } = await readDocument(dshHome)
  const scene = document.scenes.find((item) => item.name === sceneName)
  // 场景已经不在了（手改了文件 / 迁移失败）：按「跟随工作区」处理。拿一张空白名单
  // 把这个会话的技能一次全关掉，比「场景没生效」糟得多。
  if (scene === undefined) return null
  return layerOf(scene, await rowsOf(service, workspace)).layer
}

/**
 * 把上一个场景留下的提示词恢复回去。
 *
 * 只在「这个目标上现在生效的仍然是它当初应用的那份」时才停用：用户进入场景后手工换了
 * 一份预设，退出场景不该把他换的那份也撤掉。
 */
async function revertPrompt(
  dshHome: string,
  snapshot: PromptSnapshot | null,
  expectedPreset: string | null,
  warnings: string[],
): Promise<boolean> {
  if (snapshot === null) return false
  try {
    const applied = (await loadPrompts(dshHome)).applied.find((record) => record.key === snapshot.targetKey)
    if (applied !== undefined && (expectedPreset === null || applied.preset === expectedPreset)) {
      await setPresetEnabled(dshHome, applied.preset, false)
    }
    if (snapshot.previousPreset !== null) {
      await setPresetEnabled(dshHome, snapshot.previousPreset, true)
    }
    return true
  } catch (cause) {
    warnings.push(`恢复提示词失败：${describe(cause)}`)
    return false
  }
}

/** 应用提示词：只对「作用范围就是这个工作区」的预设生效。 */
async function applyPrompt(
  dshHome: string,
  scene: Scene | undefined,
  workspace: string,
  warnings: string[],
): Promise<{ before: PromptSnapshot | null; applied: string | null; changed: boolean }> {
  if (scene === undefined || scene.prompt === null) return { before: null, applied: null, changed: false }
  try {
    await readPreset(dshHome, scene.prompt)
    const { targetKey, appliedPreset } = await promptTargetOf(dshHome, scene.prompt)
    if (targetKey !== `${WS_PREFIX}${workspace}`) {
      warnings.push(
        `提示词「${scene.prompt}」的作用范围是 ${targetKey === 'global' ? '全局' : targetKey.slice(WS_PREFIX.length)}，`
        + '不随工作区隔离，本次已跳过（把它改成绑定本工作区的预设才能进场景）',
      )
      return { before: null, applied: null, changed: false }
    }
    const before: PromptSnapshot = { targetKey, previousPreset: appliedPreset === scene.prompt ? null : appliedPreset }
    const result = await setPresetEnabled(dshHome, scene.prompt, true)
    return { before, applied: result.changed ? scene.prompt : null, changed: result.changed }
  } catch (cause) {
    warnings.push(`应用提示词「${scene.prompt}」失败：${describe(cause)}`)
    return { before: null, applied: null, changed: false }
  }
}

/** MCP 的两条真实限制（工具由 gate 遮，配置不动）。 */
async function mcpNotes(dshHome: string, scene: Scene): Promise<string[]> {
  const notes: string[] = []
  if (!scene.exclusive) {
    notes.push('MCP 勾选需要配合「整套切换」：工具层只能做减法，非整套切换时不会新增也不会遮蔽')
  }
  try {
    const servers = (await loadMcp(dshHome)).servers
    const missing = scene.mcp.filter((wanted) => !servers.some((server) => serverMatches(server, wanted)))
    if (missing.length > 0) notes.push(`MCP 服务器 ${missing.join('、')} 在宿主里没有声明，场景无法引用它`)
    const disabled = scene.mcp.filter((wanted) => servers.some((server) => serverMatches(server, wanted) && !server.enabled))
    if (disabled.length > 0) {
      notes.push(`MCP 服务器 ${disabled.join('、')} 在宿主里没有启用：工作区场景不会替你启动它，先在 MCP 页启用`)
    }
  } catch {
    /* 读不到 patch 就不多说什么 */
  }
  return notes
}

/**
 * 为某个工作区选择场景（`null` = 这个工作区不用场景）。
 *
 * 工作区这一档同时管技能层与提示词；MCP 工具由 gate 按会话实时算，这里不碰。
 */
export async function setWorkspaceScene(
  dshHome: string,
  service: SkillService,
  workspace: string,
  sceneName: string | null,
): Promise<SceneApplyReport> {
  const target = normaliseWorkspace(workspace)
  if (target === '') throw new DomainError('error.scene.workspace', '先选一个具体的工作区（绝对路径）')

  const { document, warnings: readWarnings } = await readDocument(dshHome)
  const warnings = [...readWarnings]
  const scene = sceneName === null ? undefined : document.scenes.find((item) => item.name === sceneName)
  if (sceneName !== null && scene === undefined) throw new DomainError('error.scene.notFound', `场景不存在：${sceneName}`)

  // 同一个工作区可能以不同大小写被记录过：按已有键读写，避免存出两条互不相认的记录。
  const activeKey = keyOfWorkspace(document.active, target) ?? target
  const previousName = document.active[activeKey] ?? null
  if (previousName === sceneName) {
    return {
      scene: sceneName,
      workspace: target,
      session: null,
      changed: false,
      replaced: null,
      applied: { skills: scene?.skills.length ?? 0, mcp: scene?.mcp.length ?? 0, prompt: null },
      warnings,
    }
  }

  // ① 技能：整层写入（按这个工作区的行算白名单）。
  const rows = await rowsOf(service, target)
  const { layer, hitCount } = scene === undefined ? { layer: null, hitCount: 0 } : layerOf(scene, rows)
  if (scene !== undefined && hitCount < scene.skills.length) {
    warnings.push(`场景里有 ${scene.skills.length - hitCount} 条技能已经不在这个工作区里，本次只生效了 ${hitCount} 条`)
  }
  const written = await service.setLayer(`${WS_PREFIX}${target}`, layer)
  if (written.ok !== true) throw new DomainError('error.scene.layer', String(written.error ?? '写入工作区技能层失败'))
  const layerChanged = (written.data as { changed?: boolean } | undefined)?.changed === true

  // ② 提示词：先撤旧的，再应用新的。
  const appliedKey = keyOfWorkspace(document.applied, target) ?? target
  const previousSnapshot = document.applied[appliedKey]?.promptBefore ?? null
  const previousScene = previousName === null ? undefined : document.scenes.find((item) => item.name === previousName)
  const reverted = await revertPrompt(dshHome, previousSnapshot, previousScene?.prompt ?? null, warnings)
  const prompt = await applyPrompt(dshHome, scene, target, warnings)

  // ③ 记账。
  if (sceneName === null) delete document.active[target]
  else document.active[target] = sceneName
  // 工作区默认都换了，之前「下一场会话用 X」那条意图就作废了：否则它会在下一场会话里
  // 盖掉用户刚设的默认。
  delete document.pending[activeKey]
  delete document.pending[target]
  if (prompt.before === null) delete document.applied[target]
  else document.applied[target] = { scene: sceneName ?? '', at: Date.now(), promptBefore: prompt.before }
  await writeDocument(dshHome, document)

  // ④ 跟随工作区的会话要跟着重算；有自己选择的会话不动。
  await reconcileSessionLayers(dshHome, service, warnings)

  if (scene !== undefined) warnings.push(...await mcpNotes(dshHome, scene))
  if (previousName !== null && !reverted && previousScene?.prompt != null) {
    warnings.push('上一个场景没有留下可恢复的提示词（可能已被外部改动）')
  }

  return {
    scene: sceneName,
    workspace: target,
    session: null,
    changed: layerChanged || prompt.changed || previousName !== sceneName,
    replaced: previousName,
    applied: { skills: hitCount, mcp: scene?.mcp.length ?? 0, prompt: prompt.applied },
    warnings,
  }
}

/** 会话自己的选择：`undefined` = 跟随工作区，`null` = 明确不用，名字 = 用这个场景。 */
export async function setSessionScene(
  dshHome: string,
  service: SkillService,
  sessionId: string,
  workspace: string,
  sceneName: string | null | undefined,
  options: { carryOver?: boolean } = {},
): Promise<SceneApplyReport> {
  const id = sessionId.trim()
  if (id === '') throw new DomainError('error.scene.session', '缺少会话标识，无法设置会话级场景')
  const target = normaliseWorkspace(workspace)
  if (target === '') throw new DomainError('error.scene.workspace', '会话没有工作区目录，场景无法使用')

  const { document, warnings } = await readDocument(dshHome)
  const scene = typeof sceneName === 'string' ? document.scenes.find((item) => item.name === sceneName) : undefined
  if (typeof sceneName === 'string' && scene === undefined) {
    throw new DomainError('error.scene.notFound', `场景不存在：${sceneName}`)
  }

  const rows = await rowsOf(service, target)
  const matched = scene === undefined
    ? []
    : rows.filter((row) => !row.shadowed && scene.skills.some((ref) => rowMatchesRef(row, ref)))

  // 「跟随工作区」= 删掉会话层；「明确不用」= 白名单但一条不留；否则就是该场景的层。
  // 一条都没命中时写 null（跟随下层），**不写**空白名单：只含 MCP 的场景（技能留空是
  // 常态）本来就不该动技能，而空白名单会把整个会话的技能全关掉。
  const layer = sceneName === undefined
    ? null
    : (sceneName === null
      ? NOTHING_LAYER
      : (scene === undefined ? null : (layerOf(scene, rows).layer ?? null)))
  const written = await service.setLayer(`${SS_PREFIX}${id}`, layer)
  if (written.ok !== true) throw new DomainError('error.scene.layer', String(written.error ?? '写入会话技能层失败'))
  const layerChanged = (written.data as { changed?: boolean } | undefined)?.changed === true

  if (sceneName === undefined) delete document.sessions[id]
  else document.sessions[id] = { scene: sceneName, workspace: target, at: Date.now() }

  // 开始会话时选的那一次，额外记一条「本工作区的下一场会话」：新会话页的 id 未必会
  // 变成真正的对话（宿主在发送时才建会话），只写会话层会让这次选择静静失效。
  if (options.carryOver === true) {
    if (sceneName === undefined) delete document.pending[target]
    else document.pending[target] = { scene: sceneName, from: id, at: Date.now() }
  }

  await writeDocument(dshHome, document)

  if (scene !== undefined && matched.length < scene.skills.length) {
    warnings.push(
      `场景里有 ${scene.skills.length - matched.length} 条技能在这个工作区里找不到（可能改名 / 移动 / 被同名技能遮蔽），`
      + `本会话只能生效 ${matched.length} 条`,
    )
  }
  if (scene !== undefined && scene.exclusive === true && scene.skills.length > 0 && matched.length === 0) {
    warnings.push('这个场景一条技能都没匹配上，而它是「整套切换」：本会话里其它技能也会被挡掉')
  }
  if (scene !== undefined && scene.prompt !== null) {
    warnings.push('会话级场景不改变提示词：AGENTS.md 按工作区读取，提示词仍由工作区的场景决定')
  }
  if (scene !== undefined) warnings.push(...await mcpNotes(dshHome, scene))

  return {
    scene: sceneName === undefined ? (document.active[keyOfWorkspace(document.active, target) ?? target] ?? null) : sceneName,
    workspace: target,
    session: id,
    changed: layerChanged,
    replaced: null,
    applied: { skills: matched.length, mcp: scene?.mcp.length ?? 0, prompt: null },
    warnings,
  }
}

/**
 * 把「下一场会话」的意图认领到这个会话上。
 *
 * 时机：一个**真正的** agent 第一次读技能时（provider 的 `beforeView`）。那时才确知
 * 「这个 id 是活的对话」；新会话页上的草稿 id 永远不会走到这一步。
 *
 * 三条克制：会话已经自己选过（包括 `/scene`）就不动；意图超过 30 分钟就不算数；
 * 认领后把草稿 id 那条残留记录一起清掉（否则状态文件里会攒一堆永远不会再有会话的层）。
 */
export async function adoptPendingScene(
  dshHome: string,
  service: SkillService,
  sessionId: string,
  workspace: string,
): Promise<{ adopted: string | null; changed: boolean }> {
  const id = sessionId.trim()
  const target = normaliseWorkspace(workspace)
  if (id === '' || target === '') return { adopted: null, changed: false }

  const { document } = await readDocument(dshHome)
  if (document.sessions[id] !== undefined) return { adopted: null, changed: false }
  const key = keyOfWorkspace(document.pending, target)
  const pending = key === undefined ? undefined : document.pending[key]
  if (key === undefined || pending === undefined) return { adopted: null, changed: false }

  if (Date.now() - pending.at > PENDING_TTL_MS) {
    delete document.pending[key]
    await writeDocument(dshHome, document)
    return { adopted: null, changed: false }
  }

  const sceneName = pending.scene
  const scene = sceneName === null ? undefined : document.scenes.find((item) => item.name === sceneName)
  const rows = await rowsOf(service, target)
  const layer = sceneName === null
    ? NOTHING_LAYER
    : (scene === undefined ? null : (layerOf(scene, rows).layer ?? null))
  const written = await service.setLayer(`${SS_PREFIX}${id}`, layer)
  if (written.ok !== true) return { adopted: null, changed: false }

  document.sessions[id] = { scene: sceneName, workspace: target, at: Date.now() }
  delete document.pending[key]
  if (pending.from !== '' && pending.from !== id) {
    delete document.sessions[pending.from]
    await service.setLayer(`${SS_PREFIX}${pending.from}`, null)
  }
  await writeDocument(dshHome, document)
  return { adopted: sceneName, changed: true }
}


/**
 * 按当前文档重新物化每个会话的技能层。
 *
 * 为什么要这一步：层是写进状态文件的**快照**，而场景定义、工作区映射、会话选择都可能变。
 * 只改文档不重算，会话就会停在旧场景上。
 */
export async function reconcileSessionLayers(
  dshHome: string,
  service: SkillService,
  warnings: string[] = [],
): Promise<void> {
  const { document } = await readDocument(dshHome)
  for (const [sessionId, choice] of Object.entries(document.sessions)) {
    const workspace = normaliseWorkspace(choice.workspace)
    if (workspace === '') continue
    const layer = choice.scene === null
      // 「明确不用」只在工作区本来有场景时才需要压一层；工作区没有场景时它本来就什么都不该遮。
      ? (keyOfWorkspace(document.active, workspace) === undefined ? null : NOTHING_LAYER)
      : await layerFor(dshHome, service, workspace, choice.scene)
    const written = await service.setLayer(`${SS_PREFIX}${sessionId}`, layer)
    if (written.ok !== true) warnings.push(`会话 ${sessionId} 的技能层没有写进去：${String(written.error ?? '')}`)
  }
}
