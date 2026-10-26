/**
 * SKILL.md 的 frontmatter：解析宿主需要的那部分，原样保住不属于我们的部分。
 *
 * 两条规则：
 *   1. 解析刻意只做**一小撮** YAML —— 技能契约定义的那几个键（`name`、`description`、
 *      `whenToUse`、两个调用开关、`metadata`），加上块标量、引号字符串、行内数组、
 *      一层嵌套 map。其余一律当原始字符串处理：技能是用户的文件，不是我们的。
 *   2. 编辑绝不重新生成整份文档。`patchFrontmatter()` 只替换被点名要改的那几个块，
 *      其余每个字节都留着，所以再古怪的 frontmatter（锚点、多文档、注释）也能扛过一次编辑。
 */

export interface FrontmatterBlock {
  key: string
  /** 这个键对应块的确切行（含第一行）。 */
  lines: string[]
}

export interface ParsedSkillFile {
  /** 文件不是以 `---` 开头时为 false。 */
  hasFrontmatter: boolean
  /** 两条围栏之间的原始文本（不含围栏）。 */
  raw: string
  /** 按源文件顺序的键块，供改写路径使用。 */
  blocks: FrontmatterBlock[]
  /** 尽力解码出的值。 */
  data: Record<string, unknown>
  /** 收尾围栏之后的全部内容（永远不会是 `undefined`）。 */
  body: string
  /** 整个文件都读不懂时才有值（例如围栏没有闭合）。 */
  problem?: string
}

const FENCE = /^\uFEFF?---[ \t]*\r?\n/
const CLOSING = /^---[ \t]*$/

/**
 * 宿主对技能名的要求（与 `@deepseek-ai/dsh-skill` 的 `SKILL_NAME` 完全一致）：
 * 小写字母 / 数字，用单个连字符分段。
 *
 * 这条规则必须在这里守住，因为宿主是在 `skills.list()` 的 provider 返回值上**硬校验**的：
 * 一条不合规的候选不是「跳过这一条」，而是让整次 list() 抛错 —— 表现给用户就是
 * 「本轮运行失败 skill provider "tool-center" returned invalid skill name ...」。
 */
const HOST_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isHostSkillName(name: string): boolean {
  return HOST_SKILL_NAME.test(name)
}

/** 解析一个 SKILL.md。永不抛错。 */
export function parseSkillFile(text: string): ParsedSkillFile {
  const source = typeof text === 'string' ? text : ''
  if (!FENCE.test(source)) {
    return { hasFrontmatter: false, raw: '', blocks: [], data: {}, body: source, problem: 'missing frontmatter fence' }
  }
  const afterFence = source.replace(FENCE, '')
  const lines = afterFence.split(/\r?\n/)
  let closing = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (CLOSING.test(lines[index])) {
      closing = index
      break
    }
  }
  if (closing < 0) {
    return { hasFrontmatter: true, raw: afterFence, blocks: [], data: {}, body: '', problem: 'unterminated frontmatter' }
  }
  const raw = lines.slice(0, closing).join('\n')
  const body = lines.slice(closing + 1).join('\n').replace(/^\r?\n/, '')
  const blocks = splitBlocks(lines.slice(0, closing))
  const data: Record<string, unknown> = {}
  for (const block of blocks) {
    const decoded = decodeBlock(block)
    if (decoded !== undefined) data[block.key] = decoded.value
  }
  return { hasFrontmatter: true, raw, blocks, data, body }
}

/**
 * 把 frontmatter 的行按「一个键一块」切开。
 *
 * 空行与注释行单独成块（`key: ''`）：它们不属于任何键，所以改写某个键时，不能顺手
 * 把它下面那条注释一起吞掉。
 */
function splitBlocks(lines: string[]): FrontmatterBlock[] {
  const blocks: FrontmatterBlock[] = []
  let current: FrontmatterBlock | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      blocks.push({ key: '', lines: [line] })
      current = null
      continue
    }
    const keyMatch = /^([A-Za-z0-9_.-]+)[ \t]*:/.exec(line)
    if (keyMatch !== null) {
      current = { key: keyMatch[1], lines: [line] }
      blocks.push(current)
      continue
    }
    if (current !== null) current.lines.push(line)
    else {
      current = { key: '', lines: [line] }
      blocks.push(current)
    }
  }
  return blocks
}

function decodeBlock(block: FrontmatterBlock): { value: unknown } | undefined {
  if (block.key === '') return undefined
  const first = block.lines[0]
  const colon = first.indexOf(':')
  if (colon < 0) return undefined
  const valueText = first.slice(colon + 1).trim()
  const continuation = block.lines.slice(1)
  return { value: decodeValue(valueText, continuation) }
}

function decodeValue(valueText: string, continuation: string[]): unknown {
  // 块标量：`|`、`|-`、`|+`、`>`、`>-`、`>+`，后面可带缩进提示。
  const blockMatch = /^([|>])([+-]?)(\d*)$/.exec(valueText)
  if (blockMatch !== null) {
    const folded = blockMatch[1] === '>'
    const chomp = blockMatch[2]
    const lines = stripIndent(continuation)
    const joined = folded ? foldLines(lines) : lines.join('\n')
    return chomp === '-' ? joined.replace(/\n+$/, '') : joined
  }
  if (valueText === '') {
    // 可能是空标量、嵌套 map，或嵌套序列。
    const nested = parseNested(continuation)
    return nested === undefined ? '' : nested
  }
  if (valueText.startsWith('[') && valueText.endsWith(']')) {
    const inner = valueText.slice(1, -1).trim()
    if (inner === '') return []
    return splitInline(inner).map((item) => decodeScalar(item))
  }
  return decodeScalar(valueText)
}

function parseNested(continuation: string[]): unknown {
  const meaningful = continuation.filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
  if (meaningful.length === 0) return undefined
  const sequence = meaningful.every((line) => /^\s*-(\s|$)/.test(line))
  if (sequence) return meaningful.map((line) => decodeScalar(line.replace(/^\s*-(\s+|$)/, '')))
  const map: Record<string, unknown> = {}
  let currentKey = ''
  let buffer: string[] = []
  const flush = (): void => {
    if (currentKey === '') return
    map[currentKey] = decodeValue(buffer[0] ?? '', buffer.slice(1))
  }
  for (const line of meaningful) {
    const match = /^\s+([A-Za-z0-9_.-]+)[ \t]*:(.*)$/.exec(line)
    if (match !== null) {
      flush()
      currentKey = match[1]
      buffer = [match[2].trim()]
      continue
    }
    if (currentKey !== '') buffer.push(line)
  }
  flush()
  return Object.keys(map).length === 0 ? undefined : map
}

function stripIndent(lines: string[]): string[] {
  const kept = lines.filter((line, index) => !(index === lines.length - 1 && line.trim() === ''))
  let indent = Number.POSITIVE_INFINITY
  for (const line of kept) {
    if (line.trim() === '') continue
    indent = Math.min(indent, /^\s*/.exec(line)?.[0].length ?? 0)
  }
  if (!Number.isFinite(indent)) indent = 0
  return kept.map((line) => (line.trim() === '' ? '' : line.slice(indent)))
}

function foldLines(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (line === '') out += '\n'
    else out += (out === '' || out.endsWith('\n') ? '' : ' ') + line
  }
  return out
}

function splitInline(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted: string | null = null
  let current = ''
  for (const char of text) {
    if (quoted !== null) {
      current += char
      if (char === quoted) quoted = null
      continue
    }
    if (char === '"' || char === "'") {
      quoted = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

function decodeScalar(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  if ((trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)) {
    const inner = trimmed.slice(1, -1)
    return trimmed.startsWith('"') ? unescapeDouble(inner) : inner.replace(/''/g, "'")
  }
  const lower = trimmed.toLowerCase()
  if (lower === 'true' || lower === 'null' || lower === '~') return lower === 'true' ? true : null
  if (lower === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function unescapeDouble(text: string): string {
  return text.replace(/\\(["\\/nrt])/g, (_all, char: string) => {
    switch (char) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      default: return char
    }
  })
}

/**
 * 技能契约给两个调用开关定的严格布尔语法：YAML 布尔，外加大小写不敏感的
 * `true/false`、`yes/no`、`on/off`、`1/0`。其余一律返回 `undefined`，
 * 这样拼写错了会被如实报出来，而不是静默放行某个调用面。
 */
export function strictBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined
  if (typeof value !== 'string') return undefined
  const lowered = value.trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(lowered)) return true
  if (['false', 'no', 'off', '0'].includes(lowered)) return false
  return undefined
}

/** 把一个标量写成 YAML 值（非必须时不加引号）。 */
export function encodeScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const text = value === null || value === undefined ? '' : String(value)
  if (text === '') return '""'
  if (text.includes('\n')) {
    const lines = text.split('\n')
    return '|-\n' + lines.map((line) => (line === '' ? '' : '  ' + line)).join('\n')
  }
  const needsQuotes = /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
    /: |: $| #|\s$/.test(text) ||
    ['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'].includes(text.toLowerCase()) ||
    /^-?\d+(\.\d+)?$/.test(text)
  if (!needsQuotes) return text
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/**
 * 替换（或追加）frontmatter 里的指定键，其余块逐字节保留。
 * 值为 `undefined` 表示删除该键；给了 `body` 就替换正文，不给则保持原正文。
 */
export function patchFrontmatter(parsed: ParsedSkillFile, changes: Record<string, unknown>, body?: string): string {
  const blocks = parsed.blocks.map((block) => ({ key: block.key, lines: [...block.lines] }))
  for (const [key, value] of Object.entries(changes)) {
    const index = blocks.findIndex((block) => block.key === key)
    if (value === undefined) {
      if (index >= 0) blocks.splice(index, 1)
      continue
    }
    const rendered = encodeScalar(value)
    const lines = rendered.includes('\n') ? `${key}: ${rendered}`.split('\n') : [`${key}: ${rendered}`]
    if (index >= 0) blocks[index] = { key, lines }
    else blocks.push({ key, lines })
  }
  // 空行 / 注释块（`key: ''`）要留着：它们不属于任何人，静默丢掉等于用户第一次编辑
  // 就被删掉了自己写的注释。
  const raw = blocks
    .map((block) => block.lines.join('\n'))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
  const nextBody = body === undefined ? parsed.body : body
  return `---\n${raw}\n---\n\n${nextBody.replace(/^\r?\n/, '')}`
}

/** 生成一份全新的技能文件。 */
export function buildSkillFile(fields: {
  name: string
  description: string
  whenToUse?: string
  extra?: Record<string, unknown>
  body: string
}): string {
  const lines = ['---', `name: ${encodeScalar(fields.name)}`, `description: ${encodeScalar(fields.description)}`]
  if (fields.whenToUse !== undefined && fields.whenToUse !== '') {
    lines.push(`whenToUse: ${encodeScalar(fields.whenToUse)}`)
  }
  for (const [key, value] of Object.entries(fields.extra ?? {})) {
    if (value === undefined) continue
    lines.push(`${key}: ${encodeScalar(value)}`)
  }
  lines.push('---', '', fields.body.replace(/^\r?\n/, ''))
  return lines.join('\n')
}
