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
import type { SkillRoot, SkillRow, SkillStateView } from '../shared/types.ts'
import { readTextOrNull, statOrNull } from '../shared/fs.ts'
import { modelVisible, needsOverlay, userVisible } from './policy.ts'
import { isHostSkillName, parseSkillFile } from './frontmatter.ts'

/**
 * 宿主要求的候选形状：名字必须 kebab-case、描述非空。
 *
 * 宿主是在 `skills.list()` 的 provider 返回值上**硬校验**的，而且校验在 try/catch 之外：
 * 一条不合规的候选会让整次 list() 抛错，表现给用户就是「本轮运行失败 skill provider
 * "tool-center" returned invalid skill name ...」。所以这里必须逐条挡掉，不能指望
 * 「停用候选不可见、描述无所谓」。
 */
function publishable(row: SkillRow): boolean {
  const name = row.declaredName || row.name
  if (!isHostSkillName(name)) return false
  return typeof row.description === 'string' && row.description.trim() !== ''
}

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
   * 取当前视图。`cwd` 决定包含哪些项目来源；`scopeKey` 选择工作区 / 会话层
   * （`ws:<工作区>` 或 `ss:<根会话>`）。
   */
  viewFor(cwd: string | undefined, scopeKey: string | undefined): Promise<SkillStateView>
  /** 当前 cwd 下的来源元数据（按 key）。 */
  rootsFor(cwd: string | undefined): Promise<SkillRoot[]>
  /**
   * 这条 provider 固定按哪个作用域解析（注册进 agent 作用域时给 `ss:<会话>`）。
   *
   * 给了它就要额外算一份「下层的答案」（工作区 / 全局），因为**会话层可能比下层更宽**：
   * 下层藏着一条技能、会话层把它放开时，我们不能什么都不发 —— 下层那条隐藏候选仍然在
   * 注册表里，只有在这个 agent 层里发一条可见候选才能压过它。
   */
  scopeKey?: string
  /**
   * 每次 list 之前跑一次（会话级 provider 用它认领「开始会话时选好的场景」）。
   *
   * 放在这里而不是 agent/created 上：宿主要拿到候选才继续拼上下文，`list()` 是**被等待**
   * 的那一步，也就成了「第一次读技能」的确定时机 —— 认领写完再算候选，第一轮就能生效。
   */
  beforeView?(cwd: string | undefined): Promise<void>
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

/**
 * @param rows 这一层解析后的行
 * @param roots 来源元数据（hostScans）
 * @param widen 这些名字在**下层**不可见、但在这一层可见 —— 必须强制发候选才能压过下层
 */
function buildCandidates(rows: SkillRow[], roots: SkillRoot[], widen?: Set<string>): ProviderCandidate[] {
  const hostScansOf = new Map<string, boolean>()
  for (const root of roots) hostScansOf.set(root.key, root.hostScans)
  const candidates: ProviderCandidate[] = []
  for (const row of rows) {
    const hostScans = hostScansOf.get(row.rootKey) ?? false
    // 被遮蔽的行永不发布：赢家候选的 rank 已经在整组之下，早已压过宿主为这份副本发的条目。
    if (!needsOverlay(row, hostScans) && !(widen?.has(row.declaredName || row.name) ?? false)) continue
    // 宿主会拒收形状不对的候选，而且拒收是整次 list() 抛错 —— 宁可这条不发。
    if (!publishable(row)) continue
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
      await deps.beforeView?.(options.cwd)
      if (isAborted(signal)) return []
      const view = await deps.viewFor(options.cwd, deps.scopeKey)
      if (isAborted(signal)) return []
      const roots = await deps.rootsFor(options.cwd)

      // 会话层可能比下层**更宽**（下层藏着一条技能、会话里放开）。那种情况下必须在这个
      // agent 层里主动发一条可见候选，否则下层的隐藏候选仍然赢 —— 注册表按层取，不看 rank。
      let widen: Set<string> | undefined
      if (deps.scopeKey !== undefined && deps.scopeKey !== '') {
        const base = await deps.viewFor(options.cwd, undefined)
        const hiddenBefore = new Set<string>()
        for (const root of base.roots) {
          for (const row of root.skills) {
            if (!row.shadowed && !row.policy.modelInvocable) hiddenBefore.add(row.declaredName || row.name)
          }
        }
        widen = new Set(
          view.roots.flatMap((root) => root.skills)
            .filter((row) => !row.shadowed && row.policy.modelInvocable && hiddenBefore.has(row.declaredName || row.name))
            .map((row) => row.declaredName || row.name),
        )
        if (widen.size === 0) widen = undefined
      }

      return buildCandidates(
        view.roots.flatMap((root) => root.skills),
        roots,
        widen,
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
      const description = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : candidate.description
      // 列表之后磁盘被改成没有描述：宿主的 validateDefinition 会直接抛错，这里报「没了」
      // 让它重新发现，而不是把一条不合规的定义交上去。
      if (description === '') return undefined
      const whenToUseRaw = parsed.data.whenToUse
      return {
        name: candidate.name,
        description,
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
