/**
 * `ctx.skills` 的 provider。
 *
 * `ctx.skills` 没有 enable/disable 接口（只有 `registerProvider / register / list /
 * snapshot / get`），所以「停用一条技能」的做法是：为它发布一条 **对模型不可调用** 的
 * 候选，rank 落在它所属同名组的最优 rank 之下。注册表按名字合并各 provider，rank 小的
 * 胜出，于是我们的候选就成了宿主看到的答案 —— 而磁盘上的文件一个字节都没动。
 *
 * 我们只发布必须发的那些（见 `needsOverlay`）：宿主自己的 filesystem provider 已经在供给
 * 它认识的那些来源里的顶层、启用态技能，再发一遍会让每条都重复，还会让我们自己的 `get`
 * 去重读宿主本可以供给的正文。
 */
import type { SkillRoot, SkillRow, SkillStateView } from '../shared/types.js'
import { readTextOrNull, statOrNull } from '../shared/fs.js'
import { modelVisible, needsOverlay, userVisible } from './policy.js'
import { parseSkillFile } from './frontmatter.js'

export const PROVIDER_NAME = 'tool-center'

/** 我们为什么发这条候选（面板诊断时有用）。 */
export type OverlayReason = 'external' | 'policy' | 'shadow' | 'nested' | 'invalid' | 'preferred'

export interface ProviderCandidate {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  source: string
  provider: string
  rank: number
  locator: {
    rootKey: string
    name: string
    declaredName: string
    docPath: string
    entryPath: string
    form: 'bundle' | 'flat'
    overlay: OverlayReason
  }
  path: string
  resourceBase: { kind: 'directory'; path: string }
  metadata: { skillManager: { rootKey: string; form: 'bundle' | 'flat'; nested: boolean; overlay: OverlayReason } }
}

export interface ProviderDeps {
  /**
   * 取当前视图。`cwd` 决定包含哪些项目来源；`scopeKey` 选择会话 / 工作区层
   * （预留 —— 目前永远返回全局层）。
   */
  viewFor(cwd: string | undefined, scopeKey: string | undefined): Promise<SkillStateView>
  /** 当前 cwd 下的来源元数据（按 key）。 */
  rootsFor(cwd: string | undefined): Promise<SkillRoot[]>
}

/** 判断这条候选的「介入原因」（单独成函数，便于阅读）。 */
function overlayReasonOf(row: SkillRow, hostScans: boolean): OverlayReason {
  if (row.shadowed) return 'shadow'
  if (!row.loadable) return 'invalid'
  if (!row.policy.rootOn || !row.policy.skillOn) return 'policy'
  if (row.preferred) return 'preferred'
  if (row.nested) return 'nested'
  if (!hostScans) return 'external'
  return 'policy'
}

export function buildCandidates(rows: SkillRow[], roots: SkillRoot[]): ProviderCandidate[] {
  const hostScansOf = new Map<string, boolean>()
  for (const root of roots) hostScansOf.set(root.key, root.hostScans)
  const candidates: ProviderCandidate[] = []
  for (const row of rows) {
    const hostScans = hostScansOf.get(row.rootKey) ?? false
    // 被遮蔽的行永不发布：赢家候选的 rank 已经在整组之下，早已压过宿主为这份副本发的条目。
    if (!needsOverlay(row, hostScans)) continue
    const overlay = overlayReasonOf(row, hostScans)
    candidates.push({
      name: row.declaredName || row.name,
      description: row.description,
      ...(row.whenToUse === undefined ? {} : { whenToUse: row.whenToUse }),
      // 「可见」只由 policy.ts 的两个判定决定，provider 不再自己拼一遍。
      invocation: { modelInvocable: modelVisible(row), userInvocable: userVisible(row) },
      // `source` 会出现在模型可见的目录里；保留来源类别，好回答「这条技能为什么在这儿」。
      source: row.rootKind,
      provider: PROVIDER_NAME,
      // 按同名组裁决过：比该组最优 rank 低一号，因此既压过宿主为本来源发的条目，
      // 也压过所有竞争副本。
      rank: row.overlayRank,
      locator: {
        rootKey: row.rootKey,
        name: row.name,
        declaredName: row.declaredName,
        docPath: row.docPath,
        entryPath: row.entryPath,
        form: row.form,
        overlay,
      },
      path: row.docPath,
      resourceBase: { kind: 'directory', path: row.entryPath },
      metadata: {
        skillManager: { rootKey: row.rootKey, form: row.form, nested: row.nested, overlay },
      },
    })
  }
  return candidates
}

/** 单独抽成函数（不写成内联比较），免得 TS 在 await 前后把 `aborted` 收窄成字面量。 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted === true
}

/**
 * 交给 `ctx.skills.registerProvider` 的 provider 对象。
 *
 * `list` 读的是共享视图，所以代价是「一次扫描」而不是「每条候选各走一遍树」。
 * `get` 只读 locator 指向的那一个文件，先确认它的声明名没变 —— 不必重走来源
 * （被替换的插件为了供一份正文会把整棵树再递归一遍）。
 */
export function createProvider(deps: ProviderDeps) {
  return {
    name: PROVIDER_NAME,
    async list(options: { cwd?: string; signal?: AbortSignal } = {}) {
      const signal = options.signal
      if (isAborted(signal)) return []
      const view = await deps.viewFor(options.cwd, undefined)
      if (isAborted(signal)) return []
      const roots = await deps.rootsFor(options.cwd)
      return buildCandidates(
        view.roots.flatMap((root) => root.skills),
        roots,
      )
    },
    async get(candidate: ProviderCandidate, options: { signal?: AbortSignal } = {}) {
      if (isAborted(options.signal)) return undefined
      const locator = candidate?.locator
      if (locator === undefined || typeof locator.docPath !== 'string') return undefined
      const info = await statOrNull(locator.docPath)
      if (info === null || !info.isFile()) return undefined
      const text = await readTextOrNull(locator.docPath)
      if (text === null) return undefined
      const parsed = parseSkillFile(text)
      const declared = typeof parsed.data.name === 'string' && parsed.data.name.trim() !== ''
        ? parsed.data.name.trim()
        : locator.name
      // 磁盘上的名字变了（用户在编辑器里改了名）：报「没了」，让注册表重新发现，
      // 而不是继续缓存一个过期地址。
      if (declared !== locator.declaredName) return undefined
      const descriptionRaw = parsed.data.description
      const whenToUseRaw = parsed.data.whenToUse
      return {
        name: candidate.name,
        description: typeof descriptionRaw === 'string' ? descriptionRaw.trim() : candidate.description,
        ...(typeof whenToUseRaw === 'string' && whenToUseRaw.trim() !== '' ? { whenToUse: whenToUseRaw.trim() } : {}),
        invocation: candidate.invocation,
        source: candidate.source,
        provider: PROVIDER_NAME,
        content: parsed.body,
        path: locator.docPath,
        resourceBase: candidate.resourceBase,
        metadata: candidate.metadata,
      }
    },
  }
}
