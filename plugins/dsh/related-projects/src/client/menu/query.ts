/**
 * 把输入的查询读成路径（drill）或过滤词（搜索）。
 *
 * drill 的行为与随附的文件源一致：一次 drill 选择会把草稿改写成
 * 目录自身的引用，因此下一次查询已经带着该路径——无需维护任何
 * 按会话保存、需要同步的状态。
 */
import { slashPath } from '../core/reference.js'
import type { ProjectView } from '../core/types.js'

/** 一个 drill 后的位置：哪个目录，以及在其最后一个 `/` 之后输入的文本。 */
interface DirectoryTarget {
  dir: string
  filter: string
}

/**
 * drill 留下的草稿文本是 mention token，而不是裸路径：
 * `@D:/p/src/`，路径含空格时则是 `@"D:/my p/src/"`。因此再把它
 * 当路径读回来时必须去掉这层引号——否则路径含空格的项目永远无法
 * drill 进入。
 */
function unquote(query: string): string {
  const text = query.trim()
  if (text.startsWith('@"')) return text.slice(2).replace(/"$/, '')
  if (text.startsWith('@')) return text.slice(1)
  return text
}

/**
 * 当查询本身是路径时，按路径读取。绝对形式（`D:/proj/src/`）和
 * 项目相对形式（`proj/src/`）都能解析；其他情况一律按普通搜索处理。
 */
export function directoryTarget(projects: ProjectView[], query: string): DirectoryTarget | null {
  const text = unquote(query).replace(/\\/g, '/')
  const slash = text.lastIndexOf('/')
  if (slash < 0) return null
  const head = text.slice(0, slash + 1)
  const filter = text.slice(slash + 1)
  const headLower = head.toLowerCase()
  for (const project of projects) {
    const root = slashPath(project.path)
    const rootLower = root.toLowerCase()
    if (headLower === rootLower + '/' || headLower.startsWith(rootLower + '/')) {
      return { dir: root + head.slice(root.length), filter }
    }
  }
  /* 项目相对写法：`my-app/src/`——一个有名字的目录段。 */
  const first = head.split('/')[0] ?? ''
  if (first === '') return null
  const named = projects.find((project) => project.name.toLowerCase() === first.toLowerCase())
  if (named === undefined) return null
  const root = slashPath(named.path)
  return { dir: root + head.slice(first.length), filter }
}

/**
 * 查询 → 项目，采用与文件/文件夹源相同的字段优先级：查询命名最精确的
 * 行排在最前，而行所展示的一切都可被搜索。最后这点正是 note 的用途——
 * “改了接口/表结构时同步这里的 API 文档”就是一个人记住该拉入哪个项目的
 * 方式，因此 note 命中必须能通过输入其中的词来触达。
 *
 * 每个以空白分隔的 token 都必须在某处匹配（AND，与文件搜索相同）。CJK
 * 书写不用空格，所以查询通常只有一个 token，同一条规则便退化为子串匹配。
 */
export function rankProjects(projects: ProjectView[], query: string): ProjectView[] {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token !== '')
  if (tokens.length === 0) return projects
  const hits: { project: ProjectView; score: number }[] = []
  for (const project of projects) {
    const name = project.name.toLowerCase()
    const path = project.path.toLowerCase().replace(/\\/g, '/')
    const note = project.note.toLowerCase()
    let score = 0
    let matched = true
    for (const token of tokens) {
      const inName = name.indexOf(token)
      const inPath = path.indexOf(token)
      const inNote = note.indexOf(token)
      if (inName < 0 && inPath < 0 && inNote < 0) {
        matched = false
        break
      }
      /* 名称优先：精确名称胜过前缀，前缀胜过子串。
         然后是路径（用户只记得一半的某个路径段），最后是 note。 */
      if (name === token) score += 1000
      else if (inName === 0) score += 500
      else if (inName > 0) score += 300
      else if (inPath >= 0) score += 150
      else score += 50
    }
    if (matched === true) hits.push({ project, score })
  }
  /* 同分时保持稳定，因此未排序的项目保留注册表顺序。 */
  return hits.sort((left, right) => right.score - left.score).map((hit) => hit.project)
}
