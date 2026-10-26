/**
 * 技能来源：技能从哪来、按什么顺序、哪些我们能写。
 *
 * rank 是**数据**（`state.ranks[key]` 可以覆盖），每个默认值都放在 `DEFAULT_RANKS` 里，
 * 紧挨着它为什么取这个值的说明。provider 给「必须赢下这个名字」的条目发一个比该来源
 * rank 低一号的覆盖 rank（见 `policy.ts` 的 `groupRows`）。
 */
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { SkillManagerState, SkillRoot } from '../shared/types.js'
import { pathId, pathIdSync, pathsOverlap, realOrResolved } from '../shared/paths.js'
import { isDirectory, isFile, statOrNull } from '../shared/fs.js'

/**
 * 默认 rank：越小越优先。
 *
 * 100/200 是官方的项目根，所以项目技能压过一切用户级技能。350/400 让「导入落点」与
 * 「DSH 用户目录」排在共享的 agent 目录之上。520/530 沿用被替换插件的 Codex / Claude
 * 位置。600 是「内置 / 最后的兜底」。
 */
export const DEFAULT_RANKS = {
  'project-dsh': 100,
  'project-agents': 200,
  import: 350,
  local: 400,
  agents: 450,
  codex: 520,
  claude: 530,
  builtin: 600,
  custom: 600,
} as const

export interface RootOptions {
  dshHome: string
  agentsHome: string
  claudeHome?: string
  codexHome?: string
  builtinDir?: string
}

/** 来源 rank：`state.ranks` 覆盖值优先，否则用默认值。 */
function rankOf(state: SkillManagerState, key: string, fallback: number): number {
  const override = state.ranks[key]
  return typeof override === 'number' && Number.isFinite(override) ? override : fallback
}

/** 用户主目录（Codex / Claude 的默认落点用）。 */
function homeOf(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? ''
}

/** 静态来源表：一个来源一行，省掉五段只差几个字面量的对象字面量。 */
const STATIC_ROOTS: ReadonlyArray<{
  key: string
  label: string
  kind: SkillRoot['kind']
  hostScans: boolean
  writable: boolean
  path(options: RootOptions): string
}> = [
  {
    key: 'import',
    label: '导入技能',
    kind: 'import',
    hostScans: false,
    writable: true,
    path: (options) => join(options.dshHome, 'tool-center', 'skills'),
  },
  {
    key: 'local',
    label: 'DSH 技能',
    kind: 'local',
    hostScans: true,
    writable: true,
    path: (options) => join(options.dshHome, 'skills'),
  },
  {
    key: 'agents',
    label: 'Agents 技能',
    kind: 'agents',
    hostScans: true,
    writable: false,
    path: (options) => join(options.agentsHome, 'skills'),
  },
  {
    key: 'codex',
    label: 'Codex 技能',
    kind: 'codex',
    hostScans: false,
    writable: false,
    path: (options) => join(options.codexHome ?? join(homeOf(), '.codex'), 'skills'),
  },
  {
    key: 'claude',
    label: 'Claude 技能',
    kind: 'claude',
    hostScans: false,
    writable: false,
    path: (options) => join(options.claudeHome ?? join(homeOf(), '.claude'), 'skills'),
  },
]

export function staticRoots(options: RootOptions, state: SkillManagerState): SkillRoot[] {
  const roots: SkillRoot[] = STATIC_ROOTS.map((spec) => ({
    key: spec.key,
    path: spec.path(options),
    rank: rankOf(state, spec.key, DEFAULT_RANKS[spec.key]),
    label: spec.label,
    kind: spec.kind,
    hostScans: spec.hostScans,
    writable: spec.writable,
    toggleable: true,
  }))
  if (options.builtinDir !== undefined && options.builtinDir !== '') {
    roots.push({
      key: 'builtin',
      path: resolve(options.builtinDir),
      rank: rankOf(state, 'builtin', DEFAULT_RANKS.builtin),
      label: '内置技能',
      kind: 'custom',
      hostScans: false,
      writable: false,
      toggleable: true,
    })
  }
  for (const custom of state.customRoots) {
    roots.push({
      key: custom.key,
      path: custom.path,
      rank: rankOf(state, custom.key, custom.rank ?? DEFAULT_RANKS.custom),
      label: custom.label,
      kind: 'custom',
      hostScans: false,
      // 用户自己加的目录按只读处理：本插件不在别人的目录里写 / 删技能。
      writable: false,
      toggleable: true,
    })
  }
  return roots
}

/**
 * 从 `cwd` 往上找最近的、含有 `.git` 的祖先目录，最多走 24 层。
 * 没有任何标记时，cwd 自己就是项目根（与官方 filesystem provider 同一条规则）。
 */
export async function findProjectRoot(cwd: string): Promise<string | undefined> {
  if (typeof cwd !== 'string' || cwd.trim() === '') return undefined
  let current = resolve(cwd.trim())
  for (let depth = 0; depth < 24; depth += 1) {
    if ((await statOrNull(join(current, '.git'))) !== null) return current
    const parent = resolve(join(current, '..'))
    if (parent === current) break
    current = parent
  }
  return resolve(cwd.trim())
}

/** 项目来源的稳定短标识（16 位十六进制）。 */
function projectKeyOf(projectRoot: string): string {
  const id = pathIdSync(projectRoot)
  let hash = 0xcbf29ce4
  let hash2 = 0x9dc5
  for (let index = 0; index < id.length; index += 1) {
    const code = id.charCodeAt(index)
    hash = Math.imul(hash ^ code, 0x01000193) >>> 0
    hash2 = Math.imul(hash2 ^ code, 0x85ebca6b) >>> 0
  }
  return (hash.toString(16).padStart(8, '0') + hash2.toString(16).padStart(8, '0')).slice(0, 16)
}

function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? path
}

/** 同一个项目下永远只有这两种项目来源。 */
const PROJECT_ROOTS: ReadonlyArray<{
  prefix: string
  kind: 'project-dsh' | 'project-agents'
  segments: string[]
  suffix: string
  writable: boolean
}> = [
  { prefix: 'project-dsh', kind: 'project-dsh', segments: ['.dsh', 'skills'], suffix: '.dsh', writable: true },
  { prefix: 'project-agents', kind: 'project-agents', segments: ['.agents', 'skills'], suffix: '.agents', writable: false },
]

/**
 * 某个 cwd 对应的项目来源。
 *
 * 只有真的存在至少一条技能时才列出来：一个空的 `.dsh/skills` 不该在用户打开的每个仓库的
 * 面板里都塞一行。
 */
export async function projectRootsFor(cwd: string, state: SkillManagerState): Promise<SkillRoot[]> {
  const projectRoot = await findProjectRoot(cwd)
  if (projectRoot === undefined) return []
  const id = projectKeyOf(projectRoot)
  const name = basenameOf(projectRoot)
  const roots: SkillRoot[] = PROJECT_ROOTS.map((spec) => ({
    key: `${spec.prefix}:${id}`,
    path: join(projectRoot, ...spec.segments),
    rank: rankOf(state, `${spec.prefix}:${id}`, DEFAULT_RANKS[spec.kind]),
    label: `${name} · ${spec.suffix}`,
    kind: spec.kind,
    hostScans: true,
    writable: spec.writable,
    toggleable: true,
    project: true,
  }))
  const present: SkillRoot[] = []
  for (const root of roots) {
    if (await hasSkillEntry(root.path)) present.push(root)
  }
  return present
}

/** 这个目录里是否至少有一条技能（bundle 目录或平铺 `.md`）？ */
export async function hasSkillEntry(rootPath: string): Promise<boolean> {
  if (!(await isDirectory(rootPath))) return false
  const names = await readdir(rootPath).catch(() => [] as string[])
  for (const name of names) {
    if (name.startsWith('.')) continue
    const entryPath = join(rootPath, name)
    if (await isDirectory(entryPath)) {
      if (await isFile(join(entryPath, 'SKILL.md'))) return true
      continue
    }
    if (!name.toLowerCase().endsWith('.md') || name.toLowerCase() === 'skill.md') continue
    if (await isFile(entryPath)) return true
  }
  return false
}

/** 去掉指向同一目录的重复来源（例如一个 junction 又指回了本地技能目录）。 */
export async function dedupeRoots(roots: SkillRoot[]): Promise<{ roots: SkillRoot[]; dropped: { key: string; duplicateOf: string }[] }> {
  const dropped: { key: string; duplicateOf: string }[] = []
  const kept: SkillRoot[] = []
  const seen: { key: string; real: string }[] = []
  for (const root of roots) {
    const real = await realOrResolved(root.path)
    const duplicate = seen.find((item) => item.real === real)
    if (duplicate !== undefined) {
      dropped.push({ key: root.key, duplicateOf: duplicate.key })
      continue
    }
    seen.push({ key: root.key, real })
    kept.push(root)
  }
  return { roots: kept, dropped }
}

/** 一个候选目录是否与已有来源重叠（含互相包含）。 */
export async function overlapsExisting(candidate: string, existing: SkillRoot[]): Promise<SkillRoot | undefined> {
  const target = await pathId(candidate)
  for (const root of existing) {
    const other = await pathId(root.path)
    if (target === other || pathsOverlap(target, other)) return root
  }
  return undefined
}
