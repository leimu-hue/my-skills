/** Copy for both halves of the UI, plus the live-locale plumbing. */

export const NS = 'related-projects'

export type Translate = (key: string, values?: Record<string, unknown>) => string

export const ZH: Record<string, string> = {
  'panel.title': '关联项目',
  'panel.description': '一次改动会牵动的一组其它项目（前端 / 文档 / 服务）。会话开始时会告诉模型，改后端时不必再手动找路径。',
  'panel.addHere': '+ 关联项目',
  'panel.empty': '这个工作区还没有关联项目。',
  'panel.emptyHint': '加上一次改动常一起动的项目（前端 / 文档 / 兄弟服务），模型在会话开始就会知道它们。',
  'panel.unregistered': '这个工作区已不在 DSH 的工作区列表里，关联项目仍保留。',
  'panel.copyTo': '复制整组到…',
  'panel.rows': '{n} 个项目',
  'panel.expand': '展开',
  'panel.collapse': '收起',
  'panel.namePlaceholder': '名称',
  'panel.notePlaceholder': '什么情况下需要改它？（≤200 字）',
  'panel.enabled': '启用',
  'panel.delete': '删除',
  'panel.deleteConfirm': '删除「{name}」？备注一并删除，无法恢复',
  'panel.deleteYes': '删除',
  'panel.cancel': '取消',
  'panel.open': '在文件管理器中打开',
  'panel.missing': '路径不存在',
  'panel.agentAdded': 'Agent 添加',
  'panel.limit': '每个工作区最多 {n} 个关联项目。',
  'panel.showDock': '在输入框下方显示关联项目条',
  'dock.label': '{n} 个关联项目',
  'dock.empty': '+ 关联其它项目',
  'dock.manage': '管理关联项目',
  'dock.applies': '本次会话会告诉模型这些路径',
  'menu.files': '关联项目-项目文件',
  'error.generic': '操作失败',
  'error.not-directory': '路径不存在或不是目录。',
  'error.root': '不能把磁盘根目录设为关联项目。',
  'error.home': '不能把用户主目录设为关联项目。',
  'error.self': '不能把当前工作区自身设为关联项目。',
  'error.workspace-missing': '这个会话找不到所属工作区目录，无法添加。',
  'error.limit': '已达上限（每个工作区最多 {n} 个）。',
  'error.pick-unavailable': '目录选择器不可用，请手动输入路径。',
  'error.bad-path': '这个路径无法表示为 @ 引用（包含引号或控制字符）。',
  'manual.title': '手动输入路径',
  'manual.placeholder': 'D:\\other\\project',
  'manual.ok': '确定',
  'loading': '加载中…',
}

export const EN: Record<string, string> = {
  'panel.title': 'Related projects',
  'panel.description': 'The sibling projects one change touches (frontend / docs / services). The agent learns them when a session starts, so you never hunt for a path again.',
  'panel.addHere': '+ Add project',
  'panel.empty': 'This workspace has no related projects yet.',
  'panel.emptyHint': 'Add the projects you usually change together (frontend / docs / sibling services); the agent learns them when a session starts.',
  'panel.unregistered': 'This workspace is no longer in the DSH list; its related projects are kept.',
  'panel.copyTo': 'Copy group to…',
  'panel.rows': '{n} projects',
  'panel.expand': 'Expand',
  'panel.collapse': 'Collapse',
  'panel.namePlaceholder': 'Name',
  'panel.notePlaceholder': 'When does this project need a change? (<=200 chars)',
  'panel.enabled': 'Enabled',
  'panel.delete': 'Delete',
  'panel.deleteConfirm': 'Delete "{name}"? Its note goes too, unrecoverable',
  'panel.deleteYes': 'Delete',
  'panel.cancel': 'Cancel',
  'panel.open': 'Open in file manager',
  'panel.missing': 'Path missing',
  'panel.agentAdded': 'Added by agent',
  'panel.limit': 'At most {n} related projects per workspace.',
  'panel.showDock': 'Show the related-projects row under the composer',
  'dock.label': '{n} related projects',
  'dock.empty': '+ Add related project',
  'dock.manage': 'Manage related projects',
  'dock.applies': 'The agent is told these paths for this session',
  'menu.files': 'Related projects - project files',
  'error.generic': 'Operation failed',
  'error.not-directory': 'The path does not exist or is not a directory.',
  'error.root': 'A drive root cannot be a related project.',
  'error.home': 'The user home directory cannot be a related project.',
  'error.self': 'The current workspace cannot be its own related project.',
  'error.workspace-missing': 'This session has no resolvable workspace directory.',
  'error.limit': 'Limit reached ({n} per workspace).',
  'error.pick-unavailable': 'The directory picker is unavailable; type the path instead.',
  'error.bad-path': 'That path cannot be expressed as an @ reference (it contains a quote or control character).',
  'manual.title': 'Type a path',
  'manual.placeholder': 'D:\\other\\project',
  'manual.ok': 'OK',
  'loading': 'Loading…',
}

export function fill(template: string, values?: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    values !== undefined && values[key] !== undefined ? String(values[key]) : match
  ))
}

export interface LocaleService {
  getSnapshot?(): { active?: string }
  subscribe?(listener: () => void): () => void
  register?(ns: string, dicts: Record<string, Record<string, string>>): () => void
}

function activeTag(ctx: { get(name: string): unknown }): string {
  try {
    const locale = ctx.get('locale') as LocaleService | undefined
    const snapshot = locale?.getSnapshot?.()
    if (snapshot !== null && snapshot !== undefined && typeof snapshot.active === 'string') return snapshot.active
  } catch { /* fall through to the browser */ }
  if (typeof navigator === 'object' && typeof navigator.language === 'string') return navigator.language
  return ''
}

function dictionaryFor(tag: string): Record<string, string> {
  const primary = tag.toLowerCase().replace(/_/g, '-').split('-')[0]
  return primary === 'zh' ? ZH : EN
}

export function translate(ctx: { get(name: string): unknown }, key: string, values?: Record<string, unknown>): string {
  const dict = dictionaryFor(activeTag(ctx))
  const template = dict[key] ?? EN[key] ?? key
  return fill(template, values)
}

/**
 * Keep the framework's `t` seat, but never let a raw key reach the DOM.
 *
 * The seat answers with the key itself when the namespace has no dictionary in
 * the locale runtime — a registration that never landed (the service was not
 * reachable from this fiber) or one lost to a reload. `dock.label` on screen is a
 * broken UI, worse than copy in the wrong language, so a miss falls through to
 * this plugin's own dictionary, which reads the same locale snapshot and only
 * then falls back to `navigator`. The seat stays primary: while the dictionary is
 * registered the framework wins, including any language pack registered later.
 */
export function withFallback(seat: Translate | undefined, fallback: Translate): Translate {
  return (key, values) => {
    const resolved = typeof seat === 'function' ? seat(key, values) : undefined
    if (typeof resolved === 'string' && resolved !== '' && resolved !== key) return resolved
    return fallback(key, values)
  }
}


