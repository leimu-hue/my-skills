/**
 * MCP 域：管理 `$DSH_HOME/cordis.patch.yml` 里的 MCP 服务器行。
 *
 * 为什么是「读 + 启停 + 删除」而不是完整表单：一台服务器的启动命令（`command`、`args`、
 * 环境变量、`!!js` 表达式）属于用户的主机配置，让插件替你拼一个错的命令，代价是宿主起不来。
 * 新增仍然手写；启停与删除由本插件负责，因为那两件事是幂等的、可回滚的。
 *
 * 四条安全规则：
 *   * **任何写入之前先备份**到 `tool-center/backups/`（保留最近 10 份）；
 *   * **启停写成「文件末尾的覆盖行」**，不改用户原来那条声明 —— DSH 的 patch 语义是「同一 id
 *     最后一次写入生效」，我们的段落放在最后就一定赢。注意启用也**必须显式写
 *     `disabled: false`**：只删掉我们的禁用行是不够的，用户自己那条 `disabled: true`
 *     依然在文件里生效。
 *   * **删除 = 把这个 id 的所有行都删掉**（声明与各处覆盖），否则「删了再手动加回来」
 *     会莫名继承上一次的 `disabled: true`；
 *   * **只做整块手术**：一块如果不是独立条目，就如实拒绝，不留半截 YAML 让宿主起不来。
 *
 * 不引入 YAML 依赖：这里只认 `id` / `name` / `disabled` / `config.*` 与 `args` 列表这几种
 * 形状；多行文本、锚点之类的结构一律不动它们，只做整块定位。
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DomainError } from '../shared/result.js'
import { readTextOrNull } from '../shared/fs.js'
import { writeBackup } from '../shared/backups.js'
import { writeFileAtomic } from '../shared/paths.js'

export interface McpServer {
  /** patch 行的 id（启停就是按它覆盖）。 */
  id: string
  /** 界面上显示的名字（`config.serverName`，缺失时退回 id）。 */
  name: string
  /**
   * 工具命名空间（`config.serverName`）。
   *
   * MCP 工具叫 `mcp__<serverName>__<tool>`，所以「按工作区只留某几台服务器的工具」要靠它
   * 把工具名映射回服务器；缺失时为空串（那就认不出归属，一律不当作已知服务器）。
   */
  serverName: string
  transport: string
  command: string
  args: string[]
  url: string
  /** 最终生效的启停状态（同一 id 最后一条为准）。 */
  enabled: boolean
  /** 声明这一行的位置。 */
  declaredAt: 'user' | 'tool-center'
}

export interface McpState {
  servers: McpServer[]
  patchPath: string
  patchExists: boolean
  /** 本插件写过覆盖行的服务器 id。 */
  overridden: string[]
  warnings: string[]
  backupCount: number
}

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const SECTION_START = '# >>> tool-center:mcp >>>'
const SECTION_END = '# <<< tool-center:mcp <<<'
const OVERRIDE_MARKER = '# tool-center:override:'
const MAX_BACKUPS = 10

export function patchPathOf(dshHome: string): string {
  return join(dshHome, 'cordis.patch.yml')
}

function backupsDirOf(dshHome: string): string {
  return join(dshHome, 'tool-center', 'backups')
}

interface Row {
  id: string
  name: string
  disabled: boolean
  serverName: string
  transport: string
  command: string
  url: string
  args: string[]
  /** 0 基的行号区间（含首尾）。 */
  start: number
  end: number
  inSection: boolean
}

export interface PatchParse {
  rows: Row[]
  lines: string[]
  section: { start: number; end: number } | null
}

/** 解析出所有行（只认我们关心的字段），并标出哪些落在本插件的段落里。 */
export function parsePatch(text: string): PatchParse {
  const lines = text.split(/\r?\n/)
  let sectionStart = -1
  let sectionEnd = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === SECTION_START) sectionStart = index
    if (lines[index].trim() === SECTION_END) sectionEnd = index
  }
  const inSection = (line: number): boolean =>
    sectionStart >= 0 && sectionEnd > sectionStart && line > sectionStart && line < sectionEnd

  const rows: Row[] = []
  const isItemStart = (line: string): boolean => /^\s*-\s+[A-Za-z_][\w-]*\s*:/.test(line)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)-\s+id\s*:\s*(.+?)\s*$/.exec(lines[index])
    if (match === null) continue
    const indent = match[1].length
    // 块尾：下一个缩进不大于本行、且以 `- ` 开头的条目，或段落/文件结束。
    let end = lines.length - 1
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const line = lines[probe]
      if (line.trim() === SECTION_END) {
        end = probe - 1
        break
      }
      if (!isItemStart(line)) continue
      const probeIndent = /^(\s*)/.exec(line)?.[1].length ?? 0
      if (probeIndent <= indent) {
        end = probe - 1
        break
      }
    }
    while (end > index && lines[end].trim() === '') end -= 1
    const block = lines.slice(index, end + 1)
    const field = (key: string): string => {
      for (const line of block) {
        const found = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`).exec(line)
        if (found !== null) return stripQuotes(found[1])
      }
      return ''
    }
    const args: string[] = []
    let inArgs = false
    for (const line of block) {
      if (/^\s*args\s*:\s*$/.test(line)) {
        inArgs = true
        continue
      }
      if (!inArgs) continue
      const item = /^\s*-\s+(.+?)\s*$/.exec(line)
      if (item !== null) args.push(stripQuotes(item[1]))
      else if (line.trim() !== '' && !/^\s*#/.test(line)) inArgs = false
    }
    rows.push({
      id: stripQuotes(match[2]),
      name: field('name'),
      disabled: field('disabled') === 'true',
      serverName: field('serverName'),
      transport: field('transport'),
      command: field('command'),
      url: field('url'),
      args,
      start: index,
      end,
      inSection: inSection(index),
    })
  }
  return {
    rows,
    lines,
    section: sectionStart >= 0 && sectionEnd > sectionStart ? { start: sectionStart, end: sectionEnd } : null,
  }
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * 从一次解析里得出「服务器列表与最终状态」。
 *
 * 状态判定遵循 patch 的真实语义：**同一 id 最后一条生效**。所以按文件顺序过一遍，
 * 每个 id 记住最后一行；那一行的 `disabled` 就是最终状态。
 */
function serversOf(parsed: PatchParse): { servers: McpServer[]; overridden: string[] } {
  const isServer = (row: Row): boolean => row.name === MCP_CLIENT_PACKAGE || row.serverName !== ''
  const declarations = new Map<string, Row>()
  const lastRow = new Map<string, Row>()
  for (const row of parsed.rows) {
    if (!isServer(row)) continue
    if (!declarations.has(row.id) && row.serverName !== '') declarations.set(row.id, row)
    lastRow.set(row.id, row)
  }
  const servers: McpServer[] = []
  const overridden: string[] = []
  for (const [id, declaration] of declarations) {
    const final = lastRow.get(id) ?? declaration
    if (final.inSection) overridden.push(id)
    servers.push({
      id,
      name: declaration.serverName || id,
      serverName: declaration.serverName,
      transport: declaration.transport || (declaration.command === '' ? 'http' : 'stdio'),
      command: declaration.command,
      args: declaration.args,
      url: declaration.url,
      enabled: !final.disabled,
      declaredAt: declaration.inSection ? 'tool-center' : 'user',
    })
  }
  servers.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  return { servers, overridden }
}

/** 读服务器列表与状态；只读，不写盘。 */
export async function loadMcp(dshHome: string): Promise<McpState> {
  const patchPath = patchPathOf(dshHome)
  const warnings: string[] = []
  const text = await readTextOrNull(patchPath)
  const backups = await readdir(backupsDirOf(dshHome)).catch(() => [] as string[])
  const backupCount = backups.length
  if (text === null) {
    return { servers: [], patchPath, patchExists: false, overridden: [], warnings, backupCount }
  }
  const { servers, overridden } = serversOf(parsePatch(text))
  if (servers.length === 0) warnings.push('这个 patch 文件里没有 MCP 服务器行')
  return { servers, patchPath, patchExists: true, overridden, warnings, backupCount }
}

async function backupPatch(dshHome: string): Promise<string | null> {
  const text = await readTextOrNull(patchPathOf(dshHome))
  if (text === null) return null
  const { fileName } = await writeBackup({
    dir: backupsDirOf(dshHome),
    baseName: 'cordis.patch.yml.bak',
    content: text,
    keep: MAX_BACKUPS,
  })
  return fileName
}

/** 把本插件的段落整块取出来（不含标记行）。 */
function sectionBody(lines: string[], section: { start: number; end: number } | null): string[] {
  if (section === null) return []
  return lines.slice(section.start + 1, section.end)
}

/**
 * 重写本插件的段落：先删掉旧段落，再把给定内容追加到文件末尾。
 *
 * 追加到末尾是刻意的：DSH 的 patch 是「同一 id 最后一次写入生效」，只有排在最后，
 * 我们的覆盖才一定赢过用户上面写的声明。
 */
function rewriteSection(text: string, body: string[]): string {
  const parsed = parsePatch(text)
  const lines = parsed.lines.slice()
  if (parsed.section !== null) lines.splice(parsed.section.start, parsed.section.end - parsed.section.start + 1)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  const trimmedBody = body.slice()
  while (trimmedBody.length > 0 && trimmedBody[trimmedBody.length - 1].trim() === '') trimmedBody.pop()
  if (trimmedBody.length === 0) return lines.length === 0 ? '' : lines.join('\n') + '\n'
  return [...lines, '', SECTION_START, ...trimmedBody, SECTION_END, ''].join('\n')
}

function overrideBlock(id: string, enabled: boolean): string[] {
  return [
    `${OVERRIDE_MARKER}${id}`,
    `- id: ${id}`,
    `  name: '${MCP_CLIENT_PACKAGE}'`,
    `  disabled: ${enabled ? 'false' : 'true'}`,
  ]
}

/** 把某台服务器的覆盖块从段落里摘掉（保留其它服务器的）。 */
function withoutOverride(body: string[], id: string): string[] {
  const kept: string[] = []
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index]
    if (line.startsWith(OVERRIDE_MARKER) && line.slice(OVERRIDE_MARKER.length).trim() === id) {
      // 跳过这一台的标记行与随后三行（id / name / disabled）。
      index += 3
      continue
    }
    kept.push(line)
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
  return kept
}

/**
 * 启停一台服务器：在段落里写一条显式覆盖行。幂等。
 *
 * 「启用」必须写 `disabled: false` 而不能只删掉禁用行 —— 用户自己那条 `disabled: true`
 * 仍在文件里，删掉我们的行只会让它继续生效。
 */
export async function setMcpEnabled(
  dshHome: string,
  id: string,
  enabled: boolean,
): Promise<{ id: string; enabled: boolean; changed: boolean; backup: string | null }> {
  const patchPath = patchPathOf(dshHome)
  const text = (await readTextOrNull(patchPath)) ?? ''
  // 一次解析同时给出「当前状态」与「段落位置」，不必再为了状态读第二遍、解析第三遍。
  const parsed = parsePatch(text)
  const server = serversOf(parsed).servers.find((candidate) => candidate.id === id)
  if (server === undefined) throw new DomainError('error.mcp.notFound', `没有这台 MCP 服务器：${id}`)
  if (server.enabled === enabled) return { id, enabled, changed: false, backup: null }

  const body = withoutOverride(sectionBody(parsed.lines, parsed.section), id)
  const next = [...body, ...(body.length > 0 ? [''] : []), ...overrideBlock(id, enabled)]
  const backup = await backupPatch(dshHome)
  await writeFileAtomic(patchPath, rewriteSection(text, next))
  return { id, enabled, changed: true, backup }
}

/**
 * 删除一台服务器：把这个 id 的**所有行**从文件里摘掉（声明 + 各处覆盖）。
 *
 * 为什么连覆盖行一起删：留一条 `disabled: true` 的孤儿覆盖，会让「删掉之后手动再加回来」
 * 莫名继承上一次的禁用状态 —— 那种坑不值得留。
 */
export async function deleteMcpServer(dshHome: string, id: string): Promise<{ id: string; backup: string | null }> {
  const patchPath = patchPathOf(dshHome)
  const text = await readTextOrNull(patchPath)
  if (text === null) throw new DomainError('error.mcp.noPatch', `patch 文件不存在：${patchPath}`)
  const parsed = parsePatch(text)
  const rowsForId = parsed.rows.filter((row) => row.id === id)
  if (rowsForId.every((row) => row.serverName === '')) {
    if (rowsForId.length > 0) {
      throw new DomainError('error.mcp.foreign', `这台服务器只有覆盖行、没有声明，删它请直接编辑 ${patchPath}`)
    }
    throw new DomainError('error.mcp.notFound', `没有这台 MCP 服务器：${id}`)
  }
  const lines = parsed.lines.slice()
  // 从后往前删，避免行号漂移。
  for (const row of rowsForId.slice().sort((left, right) => right.start - left.start)) {
    lines.splice(row.start, row.end - row.start + 1)
  }
  // 如果某个 `- insert:` 下面已经空了，把那一行也去掉。
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!/^\s*-\s+insert\s*:\s*$/.test(lines[index])) continue
    const indent = /^(\s*)/.exec(lines[index])?.[1].length ?? 0
    const next = lines[index + 1]
    const hasChild = next !== undefined && (/^(\s*)/.exec(next)?.[1].length ?? 0) > indent && next.trim() !== ''
    if (!hasChild) lines.splice(index, 1)
  }
  const withoutDeclaration = lines.join('\n')
  const reparsed = parsePatch(withoutDeclaration)
  const cleanedBody = withoutOverride(sectionBody(reparsed.lines, reparsed.section), id)
  const backup = await backupPatch(dshHome)
  await writeFileAtomic(patchPath, rewriteSection(withoutDeclaration, cleanedBody))
  return { id, backup }
}
