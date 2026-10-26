/**
 * 导入 / 导出。
 *
 * 两条不变式：
 *   * **平铺技能读 `docPath`，不读 `entryPath`**：`entryPath` 是它所在目录，导出平铺技能
 *     会直接 EISDIR；
 *   * **落在任何技能目录之外的文件必须报出来**，不能静默丢掉 —— 「压缩包导入成功但
 *     references/ 不见了」正是这个插件要避免的那种静默损失。
 */
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { SkillRoot, SkillRow } from '../../shared/types.js'
import { DomainError } from '../../shared/result.js'
import { exists } from '../../shared/fs.js'
import { isInside } from '../../shared/paths.js'
import { readZip, writeZip, type ZipFile } from '../../shared/zip.js'
import { assertWritable, isValidSkillName, targetOf } from './guard.js'

export interface ImportOutcome {
  imported: { name: string; files: number }[]
  skipped: { name: string; reason: string }[]
}


/** 压缩包里识别出来的一条技能（还没落盘）。 */
export interface ZipSkill {
  name: string
  /** 这一条技能在压缩包里的目录（顶层平铺的 `.md` 为空串）。 */
  directory: string
  /** 归属这条技能的全部条目。 */
  entries: ZipFile[]
  /** 顶层单个 `.md`（平铺技能）。 */
  flat: boolean
}

/** 一个压缩包「解析后」的样子：能导入的、不能导入的原因、以及无主文件。 */
export interface ZipPlan {
  skills: ZipSkill[]
  /** 认不出来的部分，带着原因（面板直接展示，不静默丢）。 */
  rejected: { name: string; reason: string }[]
  /** 落在任何技能目录之外的文件（同样要报出来）。 */
  orphans: string[]
}

/** 扫描结果：在 plan 之上补一句「这台机器上是不是已经有了」。 */
export interface ZipScan {
  candidates: { name: string; files: number; exists: boolean; flat: boolean }[]
  rejected: { name: string; reason: string }[]
}

/**
 * 解析一个压缩包，**不写盘**。
 *
 * 一条技能 = 任何含 `SKILL.md` 的目录（任意深度），外加顶层的 `*.md`。技能名取它自己的
 * 目录名，每个文件按**相对该目录**的路径落盘 —— 所以 `dist/my-skill/SKILL.md` 与
 * `my-skill/SKILL.md` 都产出 `my-skill/SKILL.md`，而 `dist/my-skill/references/a.md`
 * 会保住它的 `references/` 目录。
 */
function planZip(buffer: Buffer): ZipPlan {
  const files = readZip(buffer)

  // 第一遍：哪些目录是技能？（含 SKILL.md 的目录）
  const skillDirectories = new Set<string>()
  for (const file of files) {
    const segments = segmentsOf(file.name)
    const docIndex = segments.lastIndexOf('SKILL.md')
    if (docIndex >= 0) skillDirectories.add(segments.slice(0, docIndex).join('/'))
  }
  // 最长前缀优先：这样嵌在某个技能 bundle 内部的另一个技能，自己的文件不会被外层吞掉。
  const ordered = [...skillDirectories].sort((left, right) => right.length - left.length)

  // 第二遍：每个文件归属到它上方最内层的那条技能目录。
  const byDirectory = new Map<string, ZipFile[]>()
  const flatFiles: ZipFile[] = []
  const orphans: string[] = []
  for (const file of files) {
    const segments = segmentsOf(file.name)
    if (segments.length === 0) continue
    const owner = ordered.find((directory) => (directory === '' ? true : file.name.startsWith(directory + '/')))
    if (owner !== undefined) {
      const list = byDirectory.get(owner)
      if (list === undefined) byDirectory.set(owner, [file])
      else list.push(file)
      continue
    }
    const lowered = segments[0].toLowerCase()
    if (segments.length === 1 && lowered.endsWith('.md') && lowered !== 'skill.md') {
      flatFiles.push(file)
      continue
    }
    orphans.push(file.name)
  }

  const skills: ZipSkill[] = []
  const rejected: { name: string; reason: string }[] = []
  const taken = new Set<string>()

  for (const [directory, entries] of byDirectory) {
    if (directory === '') {
      // SKILL.md 直接躺在压缩包根部时没有目录名可当技能名；随便猜一个名字静默导入
      // 只会让人意外。
      rejected.push({ name: '（压缩包根目录）', reason: 'SKILL.md 在压缩包根部，没有目录名可用；请把它放进一个文件夹再打包' })
      continue
    }
    const name = basename(directory)
    if (!isValidSkillName(name)) {
      rejected.push({ name: name || '(root)', reason: '技能名不合法（必须是 kebab-case）' })
      continue
    }
    if (taken.has(name)) {
      rejected.push({ name, reason: '压缩包里还有另一条同名技能' })
      continue
    }
    taken.add(name)
    skills.push({ name, directory, entries, flat: false })
  }

  // 顶层平铺的 `*.md` 也算一条技能（single-file skill）。
  for (const file of flatFiles) {
    const name = file.name.replace(/\.md$/i, '')
    if (!isValidSkillName(name)) {
      rejected.push({ name, reason: '技能名不合法（必须是 kebab-case）' })
      continue
    }
    if (taken.has(name)) {
      rejected.push({ name, reason: '压缩包里还有另一条同名技能' })
      continue
    }
    taken.add(name)
    skills.push({ name, directory: '', entries: [file], flat: true })
  }

  return { skills, rejected, orphans }
}

/** 一条技能落盘的目标路径（bundle 是目录，平铺是 `.md` 文件）。 */
function targetOfSkill(root: SkillRoot, skill: ZipSkill): string {
  return targetOf(root, skill.flat ? `${skill.name}.md` : skill.name)
}

/** 扫描一个压缩包：给出可勾选的候选（含「已存在」标记），不写盘。 */
export async function scanZip(root: SkillRoot, buffer: Buffer): Promise<ZipScan> {
  const plan = planZip(buffer)
  const candidates: ZipScan['candidates'] = []
  for (const skill of plan.skills) {
    candidates.push({
      name: skill.name,
      files: skill.entries.length,
      exists: await exists(targetOfSkill(root, skill)),
      flat: skill.flat,
    })
  }
  const rejected = [...plan.rejected]
  if (plan.orphans.length > 0) {
    rejected.push({
      name: `${plan.orphans.length} 个文件不在任何技能目录下`,
      reason: plan.orphans.slice(0, 8).join(', '),
    })
  }
  return { candidates, rejected }
}

/**
 * 导入压缩包里的技能；给了 `only` 就只导入这些名字（面板的勾选结果）。
 *
 * 不传 `only` 等于「全导入」—— 与旧行为一致，工具 / 脚本仍能一次搬完。
 */
export async function importZip(
  root: SkillRoot,
  buffer: Buffer,
  only?: string[],
): Promise<ImportOutcome & { groups: number }> {
  assertWritable(root)
  const plan = planZip(buffer)
  const wanted = only === undefined || only.length === 0 ? undefined : new Set(only)

  const imported: ImportOutcome['imported'] = []
  const skipped: ImportOutcome['skipped'] = []
  for (const rejection of plan.rejected) skipped.push(rejection)

  for (const skill of plan.skills) {
    if (wanted !== undefined && !wanted.has(skill.name)) continue
    const target = targetOfSkill(root, skill)
    if (await exists(target)) {
      skipped.push({ name: skill.name, reason: '同名技能已存在' })
      continue
    }
    if (skill.flat) {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, skill.entries[0].data, { mode: 0o600 })
      imported.push({ name: skill.name, files: 1 })
      continue
    }
    await mkdir(target, { recursive: true })
    const prefix = skill.directory + '/'
    let count = 0
    let unsafe = false
    for (const entry of skill.entries) {
      const inner = entry.name.startsWith(prefix) ? entry.name.slice(prefix.length) : basename(entry.name)
      const destination = join(target, inner)
      if (!isInside(target, destination) || destination === target) {
        unsafe = true
        break
      }
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, entry.data, { mode: 0o600 })
      count += 1
    }
    if (unsafe) {
      await rm(target, { recursive: true, force: true }).catch(() => undefined)
      skipped.push({ name: skill.name, reason: '压缩包里有越界路径' })
      continue
    }
    imported.push({ name: skill.name, files: count })
  }

  if (plan.orphans.length > 0) {
    skipped.push({ name: `${plan.orphans.length} 个文件不在任何技能目录下`, reason: plan.orphans.slice(0, 8).join(', ') })
  }
  return { imported, skipped, groups: plan.skills.length + plan.rejected.length }
}

/** 把给定的行导出成一个 zip，每条技能放在自己的声明名下。 */
export async function exportRowsAsZip(rows: SkillRow[]): Promise<{ buffer: Buffer; files: number }> {
  const files: ZipFile[] = []
  const used = new Set<string>()
  for (const row of rows) {
    let name = row.declaredName || row.name
    if (used.has(name)) name = `${name}-${row.rootKey.replace(/[^a-z0-9-]/gi, '')}`
    used.add(name)
    for (const file of await collectFiles(row)) {
      files.push({ name: `${name}/${file.relative}`, data: await readFile(file.absolute) })
    }
  }
  if (files.length === 0) throw new DomainError('error.export.empty', '没有可导出的技能')
  return { buffer: writeZip(files), files: files.length }
}

/** 把一条技能导出成一个 zip。 */
export async function exportRowAsZip(row: SkillRow): Promise<Buffer> {
  return (await exportRowsAsZip([row])).buffer
}

/* -------------------------------- 内部工具 -------------------------------- */

function segmentsOf(name: string): string[] {
  return name.split('/').filter((segment) => segment !== '')
}

/**
 * 一条技能要进 zip 的所有文件。
 *
 * 平铺技能必须读 `docPath`（那个 `.md` 文件本身），而不是 `entryPath`（它所在目录）：
 * 早先这里读的是目录，导出平铺技能会直接 EISDIR。
 */
async function collectFiles(row: SkillRow): Promise<{ relative: string; absolute: string }[]> {
  if (row.form === 'flat') return [{ relative: 'SKILL.md', absolute: row.docPath }]
  return listTree(row.entryPath)
}

/** 一个技能 bundle 目录下的全部文件（zip 相对路径 + 绝对路径）。 */
async function listTree(entryPath: string): Promise<{ relative: string; absolute: string }[]> {
  const out: { relative: string; absolute: string }[] = []
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      if (name === '.git' || name === 'node_modules') continue
      const absolute = join(directory, name)
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) await walk(absolute)
      else out.push({ relative: relative(entryPath, absolute).split('\\').join('/'), absolute })
    }
  }
  await walk(entryPath)
  return out
}