/**
 * 扫描，以及被替换那个插件没有的缓存层。
 *
 * 这个模块围绕的成本模型：
 *   * 一次目录遍历 = `readdir` + 每条目一个 `stat`；
 *   * 读并解析 `SKILL.md` 才是贵的（一次文件读 + YAML），而它只用来拿名字 / 描述 / 开关；
 *   * 正文只在有人真要这条技能时才需要。
 *
 * 所以：每次都遍历 + stat，解析结果按 mtime/size 复用，正文只有显式 `readBody()` 才读。
 * 同一来源的并发读取共享一次遍历。`maxDepth` 限定遍历深度；`maxEntries` /
 * `maxDirectories` 让病态目录报 `truncated`，而不是卡死。
 */
import { lstat, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SkillEntry, SkillRoot } from '../shared/types.js'
import { readTextOrNull, statOrNull } from '../shared/fs.js'
import { isHostSkillName, parseSkillFile, strictBoolean } from './frontmatter.js'

export interface ScannerOptions {
  /** 在来源之下找 `SKILL.md` 的深度。1 = 只看顶层。 */
  maxDepth?: number
  /** 单个来源最多收多少条技能。 */
  maxEntries?: number
  /** 单个来源最多访问多少目录。 */
  maxDirectories?: number
  /** 解析缓存的上限。 */
  parseCacheMax?: number
}

export interface ScanResult {
  entries: SkillEntry[]
  /** 来源本身读不了时有值（目录不存在不算错误）。 */
  error?: string
  /** 撞到上限、列表不完整时为 true。 */
  truncated?: boolean
}

/** 从一个文档解析出来的、与「它摆在哪儿」无关的那部分条目。 */
type ParsedDoc = Omit<SkillEntry, 'name' | 'form' | 'linked' | 'nested'>

interface ParseCacheEntry {
  mtimeMs: number
  size: number
  doc: ParsedDoc
}

const DEFAULT_OPTIONS: Required<ScannerOptions> = {
  maxDepth: 3,
  maxEntries: 5_000,
  maxDirectories: 2_000,
  parseCacheMax: 4_000,
}

export interface Scanner {
  scan(root: SkillRoot): Promise<ScanResult>
  /** 读一条技能的完整文档（每次都从磁盘读，不缓存）。 */
  readBody(entry: SkillEntry): Promise<string>
  /** 让缓存失效（当前实现只推进代号：解析缓存自己按 mtime 校验）。 */
  invalidate(rootKey?: string): void
  /** 每次失效都 +1，界面用它判断「这份视图比那份新」。 */
  generation(): number
  stats(): { roots: number; parsed: number }
}

export function createScanner(userOptions: ScannerOptions = {}): Scanner {
  const options = { ...DEFAULT_OPTIONS, ...userOptions }
  /**
   * 只做**合流**：同一拍里两个消费者要同一个来源时，共享一次遍历。
   * 它**不是**结果缓存 —— 遍历完成后条目会被丢掉，所以在外部编辑器里改文件，
   * 下一次读就能看到，而不是等某个 TTL 过期。真正贵的部分（读 + 解析 SKILL.md）
   * 由下面的缓存按文件 mtime 与 size 复用，于是一次遍历的代价只是
   * 「`readdir` + 每条目一个 `stat`」。
   */
  const inflight = new Map<string, Promise<ScanResult>>()
  const parseCache = new Map<string, ParseCacheEntry>()
  let generation = 0

  const rememberParsed = (path: string, value: ParseCacheEntry): void => {
    if (parseCache.size >= options.parseCacheMax) {
      const oldest = parseCache.keys().next()
      if (!oldest.done) parseCache.delete(oldest.value)
    }
    parseCache.set(path, value)
  }

  /**
   * 解析一个候选文档。`stat` 就是缓存键：mtime 与 size 都没变，frontmatter 不可能变
   * （只改正文也会推高 mtime，代价只是多解析一次）。
   */
  async function parseDoc(path: string): Promise<ParsedDoc | undefined> {
    const info = await statOrNull(path)
    if (info === null || !info.isFile()) return undefined
    const cached = parseCache.get(path)
    if (cached !== undefined && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return cached.doc
    }
    const text = await readTextOrNull(path)
    if (text === null) {
      return {
        declaredName: '',
        description: '',
        docPath: path,
        entryPath: dirname(path),
        declaresModelInvocable: true,
        declaresUserInvocable: true,
        loadable: false,
        problem: 'unreadable',
      }
    }
    const parsed = parseSkillFile(text)
    const declaredRaw = parsed.data.name
    const declaredName = typeof declaredRaw === 'string' ? declaredRaw.trim() : ''
    const descriptionRaw = parsed.data.description
    const description = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : ''
    const whenToUseRaw = parsed.data.whenToUse
    const modelFlag = strictBoolean(parsed.data['disable-model-invocation'])
    const userFlag = strictBoolean(parsed.data['user-invocable'])
    // 拼写不合法时绝不能静默放行某个调用面：把它记成面板可见的问题，并让这条技能
    // 进不了模型目录。
    const modelFlagValid = parsed.data['disable-model-invocation'] === undefined || modelFlag !== undefined
    const userFlagValid = parsed.data['user-invocable'] === undefined || userFlag !== undefined
    const problems: string[] = []
    if (parsed.problem !== undefined) problems.push(parsed.problem)
    if (!parsed.hasFrontmatter) problems.push('no frontmatter')
    if (description === '') problems.push('missing description')
    // 宿主只认 kebab-case 的名字；不合规的技能它永远加载不了，所以这里如实标成问题，
    // 而不是等到 provider 把它发出去、让宿主把整次 skills.list() 抛掉。
    if (declaredName !== '' && !isHostSkillName(declaredName)) problems.push('invalid name')
    if (!modelFlagValid) problems.push('invalid disable-model-invocation')
    if (!userFlagValid) problems.push('invalid user-invocable')
    const doc: ParsedDoc = {
      declaredName,
      description,
      whenToUse: typeof whenToUseRaw === 'string' && whenToUseRaw.trim() !== '' ? whenToUseRaw.trim() : undefined,
      docPath: path,
      entryPath: dirname(path),
      declaresModelInvocable: modelFlagValid ? modelFlag !== true : false,
      declaresUserInvocable: userFlagValid ? userFlag !== false : false,
      loadable: problems.length === 0,
      problem: problems.length === 0 ? undefined : problems.join('; '),
    }
    rememberParsed(path, { mtimeMs: info.mtimeMs, size: info.size, doc })
    return doc
  }

  /** 把解析结果拼成一条完整条目：名字取自路径，`linked` / `nested` 由遍历位置决定。 */
  async function entryOf(
    path: string,
    name: string,
    form: SkillEntry['form'],
    placement: { linked: boolean; nested: boolean },
  ): Promise<SkillEntry | undefined> {
    const doc = await parseDoc(path)
    if (doc === undefined) return undefined
    // 声明名缺失时退回目录名 / 文件名，调用方不必各自兜一遍。退回的这个名字同样要过
    // 宿主的命名规则（目录名可能是中文 / 大写），否则它会在 provider 那一侧炸掉。
    const declaredName = doc.declaredName === '' ? name : doc.declaredName
    const nameProblem = isHostSkillName(declaredName) ? undefined : 'invalid name'
    return {
      ...doc,
      name,
      form,
      declaredName,
      loadable: doc.loadable && nameProblem === undefined,
      problem: withProblem(doc.problem, nameProblem),
      linked: placement.linked,
      nested: placement.nested,
    }
  }

  async function scanRoot(root: SkillRoot): Promise<ScanResult> {
    const cacheKey = root.key + '\u0000' + root.path
    const running = inflight.get(cacheKey)
    if (running !== undefined) return running
    const promise = walkRoot(root)
    inflight.set(cacheKey, promise)
    try {
      return await promise
    } finally {
      if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey)
    }
  }

  async function walkRoot(root: SkillRoot): Promise<ScanResult> {
    const entries: SkillEntry[] = []
    let truncated = false
    let visited = 0
    let error: string | undefined

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (truncated) return
      visited += 1
      if (visited > options.maxDirectories) {
        truncated = true
        return
      }
      let dirents
      try {
        dirents = await readdir(directory, { withFileTypes: true })
      } catch (cause) {
        const code = (cause as { code?: string }).code
        // ENOENT 是正常的（来源目录还没建）。其余是真实失败，面板必须能看到，
        // 不能表现成一个安静的空目录。
        if (code !== 'ENOENT' && depth === 0) error = String((cause as Error).message ?? cause)
        return
      }
      for (const dirent of dirents) {
        if (entries.length >= options.maxEntries) {
          truncated = true
          return
        }
        if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue
        const entryPath = join(directory, dirent.name)
        let isDirectory = dirent.isDirectory()
        let isFile = dirent.isFile()
        const linked = dirent.isSymbolicLink()
        if (linked) {
          // 指向目录的 junction 在 Node 里读作符号链接；解析它，好把里面的技能列出来
          // （被替换的那个插件把这种条目整个跳过了）。
          const info = await statOrNull(entryPath)
          if (info === null) continue
          isDirectory = info.isDirectory()
          isFile = info.isFile()
        }
        const placement = { linked, nested: depth > 0 }
        if (isDirectory) {
          const doc = join(entryPath, 'SKILL.md')
          const docInfo = await lstat(doc).catch(() => null)
          if (docInfo !== null && docInfo.isFile()) {
            const entry = await entryOf(doc, dirent.name, 'bundle', placement)
            if (entry !== undefined) entries.push(entry)
            continue
          }
          if (depth + 1 < options.maxDepth) await walk(entryPath, depth + 1)
          continue
        }
        if (!isFile) continue
        if (!dirent.name.toLowerCase().endsWith('.md')) continue
        if (dirent.name.toLowerCase() === 'skill.md') continue
        const entry = await entryOf(entryPath, dirent.name.replace(/\.md$/i, ''), 'flat', placement)
        if (entry !== undefined) entries.push(entry)
      }
    }

    await walk(root.path, 0)
    entries.sort((left, right) => left.name.localeCompare(right.name))
    return { entries, error, truncated: truncated || undefined }
  }

  return {
    scan: scanRoot,
    async readBody(entry: SkillEntry): Promise<string> {
      const text = await readTextOrNull(entry.docPath)
      return text === null ? '' : parseSkillFile(text).body
    },
    invalidate(_rootKey?: string) {
      // 没有需要丢掉的持久状态：解析缓存自己按文件 mtime 与 size 校验，遍历结果从不复用。
      // 代号仍然要推进，好让界面能说清「这份视图比那份新」。
      generation += 1
    },
    generation: () => generation,
    stats: () => ({ roots: inflight.size, parsed: parseCache.size }),
  }
}

/** 往已有的问题串里补一条（不重复），给 `entryOf` 补名字问题用。 */
function withProblem(problem: string | undefined, extra: string | undefined): string | undefined {
  if (extra === undefined) return problem
  const parts = (problem ?? '').split('; ').map((part) => part.trim()).filter((part) => part !== '')
  if (!parts.includes(extra)) parts.push(extra)
  return parts.join('; ')
}
