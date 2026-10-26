/**
 * 回收站：删除是**移动**，源文件绝不在原地 unlink。
 *
 * 索引是一份 JSON（`trash/index.json`）而不是每条技能一个 metadata 文件：被替换的插件在
 * **每一次** `skill-state` 里为回收站每条各读一个文件，于是成本随回收站增长。
 */
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SkillRow } from '../../shared/types.js'
import { DomainError } from '../../shared/result.js'
import { exists, readTextOrNull } from '../../shared/fs.js'
import { writeFileAtomic } from '../../shared/paths.js'
import { assertOneSkill, assertRowWritable, copyTree } from './guard.js'

export interface TrashItem {
  id: string
  name: string
  declaredName: string
  rootKey: string
  rootLabel: string
  form: 'bundle' | 'flat'
  deletedAt: number
  originalPath: string
  description: string
}

interface TrashIndex {
  version: 1
  items: TrashItem[]
}

export function trashRootOf(dshHome: string): string {
  return join(dshHome, 'tool-center', 'trash')
}

function trashIndexPath(dshHome: string): string {
  return join(trashRootOf(dshHome), 'index.json')
}

/** 读回收站索引：一个文件、一次读取。 */
export async function listTrash(dshHome: string): Promise<TrashItem[]> {
  const raw = await readTextOrNull(trashIndexPath(dshHome))
  if (raw === null || raw === '') return []
  try {
    const parsed = JSON.parse(raw) as TrashIndex
    if (!Array.isArray(parsed.items)) return []
    return parsed.items.filter((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
  } catch {
    return []
  }
}

async function writeTrashIndex(dshHome: string, items: TrashItem[]): Promise<void> {
  const document: TrashIndex = { version: 1, items }
  await writeFileAtomic(trashIndexPath(dshHome), JSON.stringify(document, null, 2) + '\n')
}

function newTrashId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`
}

/** 把一条技能移进回收站，返回写进索引的那条记录。 */
export async function deleteSkillToTrash(dshHome: string, row: SkillRow): Promise<TrashItem> {
  assertRowWritable(row)
  // 平铺技能要搬的是那个 `.md` 文件本身；它的 entryPath 是所在目录（也就是整个来源根），
  // 搬错了会把一整片技能目录移进回收站。只有 bundle 才是搬目录。
  const source = row.form === 'flat' ? row.docPath : row.entryPath
  assertOneSkill(source, row)
  const id = newTrashId()
  const itemDir = join(trashRootOf(dshHome), id)
  const payloadPath = join(itemDir, 'payload')
  await mkdir(itemDir, { recursive: true })
  try {
    await rename(source, payloadPath)
  } catch (cause) {
    const code = (cause as { code?: string }).code
    if (code !== 'EXDEV') {
      await rm(itemDir, { recursive: true, force: true }).catch(() => undefined)
      throw new DomainError('error.delete.failed', `删除失败（${row.declaredName}）：${String((cause as Error).message ?? cause)}`)
    }
    // 跨卷：先复制再删除。
    await copyTree(source, payloadPath)
    await rm(source, { recursive: true, force: true })
  }
  const item: TrashItem = {
    id,
    name: row.name,
    declaredName: row.declaredName,
    rootKey: row.rootKey,
    rootLabel: row.rootLabel,
    form: row.form,
    deletedAt: Date.now(),
    originalPath: source,
    description: row.description,
  }
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify(item, null, 2) + '\n', { mode: 0o600 })
  await writeTrashIndex(dshHome, [item, ...(await listTrash(dshHome))])
  return item
}

export async function restoreTrashItem(dshHome: string, id: string): Promise<TrashItem> {
  const items = await listTrash(dshHome)
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) throw new DomainError('error.trash.notFound', `回收站里没有这一条：${id}`)
  const payloadPath = join(trashRootOf(dshHome), id, 'payload')
  if (!(await exists(payloadPath))) {
    throw new DomainError('error.trash.missing', `回收站文件已丢失：${item.declaredName}`)
  }
  const target = item.originalPath
  if (await exists(target)) {
    throw new DomainError('error.trash.conflict', `原位置已有同名文件，无法恢复：${target}`)
  }
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(payloadPath, target)
  } catch (cause) {
    if ((cause as { code?: string }).code !== 'EXDEV') throw cause
    await copyTree(payloadPath, target)
    await rm(payloadPath, { recursive: true, force: true })
  }
  await writeTrashIndex(dshHome, items.filter((candidate) => candidate.id !== id))
  await rm(join(trashRootOf(dshHome), id), { recursive: true, force: true }).catch(() => undefined)
  return item
}

export async function purgeTrashItem(dshHome: string, id: string): Promise<void> {
  const items = await listTrash(dshHome)
  const remaining = items.filter((candidate) => candidate.id !== id)
  if (remaining.length === items.length) throw new DomainError('error.trash.notFound', `回收站里没有这一条：${id}`)
  await writeTrashIndex(dshHome, remaining)
  await rm(join(trashRootOf(dshHome), id), { recursive: true, force: true })
}

export async function emptyTrash(dshHome: string): Promise<number> {
  const items = await listTrash(dshHome)
  await writeTrashIndex(dshHome, [])
  const root = trashRootOf(dshHome)
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (name === 'index.json') continue
    await rm(join(root, name), { recursive: true, force: true }).catch(() => undefined)
  }
  return items.length
}
