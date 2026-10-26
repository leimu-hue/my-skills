/**
 * `@` 菜单源契约：`dsh-client-ui-input-trigger` 交给源什么，源又可以返回什么。
 *
 * 这是受支持的扩展点——菜单、键盘处理与分组都归 `dsh-client-ui-input-trigger`
 * 管；源只负责提供行，并说明一次 pick 会插入什么。不涉及菜单 UI、不涉及 DOM，
 * 也不替换任何随附服务。
 *
 * 已对照 `dsh-file-mention` 验证：它以同样的方式注册 `@file` 源：
 * `ctx.get('inputTriggers').registerSource({ trigger, name, order,
 * candidates(session, { query, signal }), warm?(session), onPick(pick) ->
 * { insert: { source, ref, label, clipboardText } } | { text, continue },
 * codec: { clipboardText(ref), serialize(ref) } })`。重复注册同一个
 * (trigger, name) 会抛错，因此调用方必须捕获。
 *
 * 候选行还可以携带随附文件/会话行已有、并由本菜单渲染的字段：
 * `icon`（'file' | 'folder' | 'session'）、`section`（组内的小标题）和
 * `value`（交回 `onPick` 的不透明载荷）。`value` 载荷让插入的路径不出现在
 * 显示文本中。
 */

export interface TriggerCandidate {
  name: string
  description?: string
  /** 渲染为行的前导图标；在 Web 外壳中为 'file' | 'folder' | 'session'。 */
  icon?: string
  /** 该行显示在此源分组内的小标题下。 */
  section?: string
  /** 目录行：`pick` 插入它，`drill`（Tab / 箭头）进入它。 */
  drill?: boolean
  /** 通过 `onPick` 原样交回的不透明载荷。 */
  value?: string
}

export interface TriggerSession {
  sessionId: string
}

export interface TriggerRequest {
  query: string
  signal: AbortSignal
}

export interface TriggerHeaderRequest {
  query: string
  quoted?: boolean
  drilled?: boolean
}

/** 分组上方的面包屑；`value` 会作为一次 drill 通过 `onPick` 返回。 */
export interface TriggerCrumb {
  label: string
  value: string
  current?: boolean
}

export interface TriggerPick {
  session: TriggerSession
  candidate: TriggerCandidate
  query?: string
  /** 'pick'（默认）或目录行的 'drill'。 */
  action?: string
}

export interface TriggerSource {
  trigger: string
  name: string
  order: number
  /**
   * 隐藏菜单管线原本会依据 `name` 渲染的分组标题；改由各行携带自己的
   * `section` 小标题。与随附的 `@` reference 源使用同一字段，菜单会读取它
   * （`trigger-client.js: seedGroups`）。
   */
  showGroupTitle?: boolean
  candidates(session: TriggerSession, request: TriggerRequest): Promise<TriggerCandidate[]>
  /** 当前层级的面包屑；仅在 drill 之后发布。 */
  header?(session: TriggerSession, request: TriggerHeaderRequest): TriggerCrumb[] | undefined
  warm?(session: TriggerSession): void
  onPick(pick: TriggerPick): unknown
  codec: { clipboardText(ref: string): string; serialize(ref: string): Promise<string> }
  lexicon?(session: TriggerSession): string[] | undefined
}

/** 由 `rows.ts` 写入的行载荷：一次 pick 必须插入的内容。 */
export interface RowValue {
  kind: string
  label: string
  mention: string
}
