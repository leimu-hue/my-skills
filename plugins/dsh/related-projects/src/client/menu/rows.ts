/** 把项目、文件和目录变成菜单行（以及反向解析）。 */
import type { InputTriggerCandidate } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { referenceOf } from '../core/reference.js'
import type { FileHit, ProjectView } from '../core/types.js'

/** 行可以指向的东西。 */
type RowKind = 'project' | 'file' | 'directory'

/** 行列携带的不透明载荷：一次 pick 必须插入的内容。 */
interface RowValue {
  kind: RowKind
  label: string
  mention: string
}

function valueOf(value: RowValue): string {
  return JSON.stringify(value)
}

function kindOf(value: unknown): RowKind {
  return value === 'file' || value === 'directory' ? value : 'project'
}

/** 单个面包屑的 drill 载荷：它要导航到的目录。 */
export function drillValue(label: string, path: string): string {
  return valueOf({ kind: 'directory', label, mention: referenceOf(path, true) })
}

/** 写入 `candidate.value` 的行载荷：一次 pick 必须插入的内容。 */
export function parseRowValue(value: unknown): RowValue | null {
  if (typeof value !== 'string' || value === '') return null
  try {
    const parsed = JSON.parse(value) as Partial<RowValue>
    if (typeof parsed.mention !== 'string' || parsed.mention === '') return null
    return {
      kind: kindOf(parsed.kind),
      label: typeof parsed.label === 'string' && parsed.label !== '' ? parsed.label : parsed.mention,
      mention: parsed.mention,
    }
  } catch {
    return null
  }
}

/** 每个项目根一行；`drill` 会打开它而不是插入它。 */
export function projectRows(projects: ProjectView[], section: string): InputTriggerCandidate[] {
  return projects.map((project) => ({
    name: project.name + '/',
    description: project.note === '' ? project.path : project.path + '  ·  ' + project.note,
    icon: 'folder',
    section,
    drill: true,
    value: valueOf({ kind: 'project', label: project.name, mention: referenceOf(project.path, true) }),
  }))
}

/** 某一目录层级的行：目录可 drill，文件可插入。 */
export function levelRows(hits: FileHit[], section: string): InputTriggerCandidate[] {
  return hits.map((entry) => {
    const directory = entry.kind === 'directory'
    return {
      name: directory ? entry.name + '/' : entry.name,
      description: entry.rel,
      icon: directory ? 'folder' : 'file',
      section,
      drill: directory,
      value: valueOf({ kind: entry.kind, label: entry.name, mention: referenceOf(entry.path, directory) }),
    }
  })
}
