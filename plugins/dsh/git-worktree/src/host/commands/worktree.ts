/**
 * `/worktree` —— 人在当前会话里管理隔离 checkout。
 *
 * 应用与删除会改用户主仓，只放在这里；创建是加法，模型也能通过 `worktree_create` 发起。
 * 会话身份只用来解析「哪个仓库」：worktree 归属仓库，不归属会话。
 */
import { DomainError, describe } from '../shared/errors.ts'
import { inspectRepository } from '../git/repository.ts'
import type { CommandRun, WorktreeView } from '../shared/types.ts'
import type { WorktreeService } from '../worktree/service.ts'

export interface CommandInvocation {
  agent?: {
    session?: {
      header?: { cwd?: unknown }
    }
  }
  rawInput?: string
}

export interface CommandResult {
  kind: 'success' | 'error'
  text: string
}

const USAGE = [
  '用法：',
  '/worktree                          列出当前仓库的隔离 checkout',
  '/worktree help                     打印这张表',
  '/worktree create <名字> [基线] [--detach] [--branch <分支>] [-- 任务…]',
  '                                   新建一个（默认建分支 worktree/<名字>，基线按配置）；',
  '                                   `--` 之后是任务：新会话会直接开工',
  '/worktree path <名字>              打印目录路径',
  '/worktree open <名字>              注册成工作区，随后可在侧栏打开并新建会话',
  '/worktree apply <名字>             把改动应用回主仓工作区（不自动提交）',
  '/worktree remove <名字> [--force]  删除（有未提交或未推送的内容时需要 --force）',
  '/worktree prune                    清理目录已丢失的残留记录',
].join('\n')

/**
 * 把 `--` 后面的部分切出来当任务。
 *
 * 不在 token 层面拼回去：那样会把任务里的连续空白塌成一个空格，
 * 而任务经常是一段带排版的文字（列表、缩进、代码）。`--` 之后一律原样。
 */
function splitTask(raw: string): { head: string; task: string } {
  const cut = /\s--(?:\s+|$)/u.exec(raw)
  if (cut === null) return { head: raw, task: '' }
  return { head: raw.slice(0, cut.index), task: raw.slice(cut.index + cut[0].length).trim() }
}

function cwdOf(invocation: CommandInvocation): string {
  const cwd = invocation.agent?.session?.header?.cwd
  return typeof cwd === 'string' ? cwd : ''
}

function summarize(view: WorktreeView): string {
  const flags = [
    view.origin === 'external' ? '外部创建' : '',
    view.current ? '当前' : '',
    view.mode === 'detached' ? 'detached' : '',
    view.dirty > 0 ? `未提交 ${view.dirty}` : '',
    view.ahead > 0 ? `领先 ${view.ahead}` : '',
    view.behind > 0 ? `落后 ${view.behind}` : '',
    view.state === 'missing' ? '目录已丢失' : '',
  ].filter((part) => part !== '')
  const branch = view.branch === null ? '' : `  [${view.branch}]`
  return `- ${view.name}${branch}  ${view.path}${flags.length === 0 ? '' : `  (${flags.join(' · ')})`}`
}

function summarizeCommands(commands: CommandRun[]): string {
  if (commands.length === 0) return ''
  const lines = commands.map((run) => {
    const label = run.kind === 'verify' ? '基线自检' : 'setup'
    return `  ${run.ok ? '✓' : '✗'} ${label}: ${run.command}${run.output === '' ? '' : '\n      ' + run.output.split(/\r?\n/).slice(-5).join('\n      ')}`
  })
  return `\n创建后命令：\n${lines.join('\n')}`
}

export function createWorktreeCommand(service: WorktreeService, timeoutMs: number) {
  return {
    name: 'worktree',
    description: '管理当前仓库的 Git 隔离 checkout（worktree）',
    input: { hint: '[help|create|path|open|apply|remove|prune] [名字] [--detach] [--force] [-- 任务…]' },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
      const cwd = cwdOf(invocation)
      if (cwd === '') return { kind: 'error', text: '这个会话没有工作目录，无法确定仓库。' }

      const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim() : ''
      const { head, task } = splitTask(raw)
      const tokens = head.split(/\s+/u).filter(Boolean)
      const verb = tokens[0] ?? 'list'
      const flags = new Set(tokens.filter((token) => token.startsWith('--')))
      const positional = tokens.filter((token) => !token.startsWith('--'))

      try {
        const info = await inspectRepository(cwd, { timeoutMs })
        const repository = info.mainRoot

        if (verb === 'help') return { kind: 'success', text: USAGE }

        if (verb === 'list') {
          const views = await service.listFor(repository)
          const isolation = info.isWorktree && !info.isSubmodule
            ? `当前已在隔离工作区：${info.root}（${info.branch ?? 'detached'}）\n`
            : ''
          /*
           * 空仓库不甩整张用法表：它是成功路径，不是错误。只给「下一步能做什么」，
           * 全部用法留给 `/worktree help` 与未知子命令的错误回执。
           */
          if (views.length === 0) {
            return {
              kind: 'success',
              text: `${isolation}仓库 ${repository} 还没有隔离 checkout。\n`
                + '\n下一步：\n'
                + '  /worktree create <名字> -- <任务>   新建一个，并让新会话直接开工\n'
                + '  /worktree create <名字>            只建检出，任务稍后自己说\n'
                + '完整用法：/worktree help',
            }
          }
          return { kind: 'success', text: `${isolation}仓库：${repository}\n${views.map(summarize).join('\n')}` }
        }

        if (verb === 'prune') {
          const result = await service.prune()
          return {
            kind: 'success',
            text: result.removed === 0
              ? '没有目录已丢失的残留记录。'
              : `已清理 ${result.removed} 条残留记录：${result.names.join('、')}`,
          }
        }

        if (verb === 'create') {
          const name = positional[1]
          if (name === undefined) return { kind: 'error', text: USAGE }
          const branchFlag = tokens.indexOf('--branch')
          const branch = branchFlag >= 0 ? tokens[branchFlag + 1] : undefined
          const result = await service.create({
            /*
             * 传会话目录，不是主仓：隔离检测问的是「人站在哪里」。
             * 以前传 `repository`（已归位到主仓），于是已经在检出里的用户还能
             * 再建一个兄弟检出——和工具路径的行为正好相反。
             */
            repository: cwd,
            name,
            base: positional[2],
            mode: flags.has('--detach') ? 'detached' : undefined,
            branch,
            /* 任务只在这里传：工具面刻意不给（否则模型会开一个新会话跟自己做同一件事）。 */
            task: task === '' ? undefined : task,
          })
          if (result.created === false || result.worktree === null) {
            const path = result.worktree?.path ?? info.root
            return {
              kind: 'success',
              text: `已经在隔离工作区里：${path}\n不再创建第二个——在当前目录继续工作即可。`
                + (task === '' ? '' : '\n（任务没有发出去：你就在这个检出里，直接说就行。）'),
            }
          }
          const view = result.worktree
          const carried = result.copied.length === 0
            ? ''
            : `\n已按 .worktreeinclude 带入 ${result.copied.length} 个本地文件。`
          const ignore = result.ignoreAdded ? '\n已把检出目录写进 .git/info/exclude（主仓保持干净）。' : ''
          const includeNote = result.includeError === undefined ? '' : `\n（.worktreeinclude 未处理：${result.includeError}）`
          const sessionLine = result.sessionId === null
            ? ''
            : `\n已在其中新建会话（${result.sessionId.slice(0, 8)}），侧栏可见。`
            + (task === '' ? '' : '\n任务已发进那个会话的第一轮，切过去就能看它开工。')
          const activation = sessionLine !== ''
            ? sessionLine
            : (result.workspaceId === null
                ? ''
                : '\n已加入工作区；在侧栏即可在这个检出里新建会话。')
          const taskError = result.taskError === undefined ? '' : `\n（任务没发出去：${result.taskError}）`
          const activationError = result.sessionError === undefined ? '' : `\n（工作区/会话未就绪：${result.sessionError}）`
          return {
            kind: 'success',
            text: `已创建 ${view.name}\n目录：${view.path}\n分支：${view.branch ?? '（detached）'}\n基线：${view.baseOid?.slice(0, 7) ?? '?'}（${view.baseBranch ?? 'HEAD'}）${carried}${ignore}${includeNote}${summarizeCommands(result.commands)}${activation}${taskError}${activationError}`,
          }
        }

        const name = positional[1]
        if (name === undefined) return { kind: 'error', text: USAGE }
        const record = service.findByName(repository, name)
        if (record === undefined) return { kind: 'error', text: `没有名为 ${name} 的隔离 checkout。\n\n${USAGE}` }

        if (verb === 'path') return { kind: 'success', text: record.path }

        if (verb === 'open') {
          const result = await service.registerWorkspace(record.id)
          return {
            kind: 'success',
            text: `已注册为工作区（${result.workspaceId}）：${result.path}\n会话的工作目录在创建后不可变，所以请从侧栏在这个工作区里新建会话。`,
          }
        }

        if (verb === 'apply') {
          const result = await service.apply(record.id)
          return {
            kind: 'success',
            text: result.files === 0
              ? '没有需要应用的改动。'
              : `已应用 ${result.files} 个文件到主仓工作区（未提交，也没动主仓 HEAD）。${result.snapshotOid === null ? '' : `\n快照：${result.snapshotOid.slice(0, 7)}（只用于取补丁，不在任何分支上）`}`,
          }
        }

        if (verb === 'remove') {
          const result = await service.remove(record.id, { force: flags.has('--force') })
          const archived = result.archivedOid === null
            ? ''
            : `\n删除前已把内容钉在 refs/dsh/archive/（${result.archivedOid.slice(0, 7)}）：git show ${result.archivedOid.slice(0, 7)} 可以取回。`
          const branch = result.branch === null
            ? ''
            : `\n分支 ${result.branch} 保留在仓库里（提交都还在）。`
          return { kind: 'success', text: `已删除 ${record.name}（${record.path}）${branch}${archived}` }
        }

        return { kind: 'error', text: `未知子命令 ${JSON.stringify(verb)}\n\n${USAGE}` }
      } catch (error) {
        if (error instanceof DomainError) {
          switch (error.code) {
            case 'no-workspace':
              return { kind: 'error', text: '这个 Host 没有工作区注册表，请手动在编辑器里打开该目录。' }
            case 'worktree-unpushed':
              return { kind: 'error', text: '这个分支上的提交还没有进任何其他分支（含远端）：先 push 或合并，确认丢弃再加 --force。' }
            case 'worktree-unmerged':
              return { kind: 'error', text: '这个 detached 检出里有任何分支都不包含的提交：确认后加 --force。' }
            case 'worktree-dirty':
              return { kind: 'error', text: '还有未提交的改动：确认后可加 --force。' }
            case 'duplicate-branch':
              return { kind: 'error', text: '同名分支已存在：换一个名字，或用 --branch 指定别的分支名。' }
            case 'worktree-external':
              return { kind: 'error', text: '这个 checkout 是外部 Git 创建的，插件只读展示，不删除。' }
            default:
              return { kind: 'error', text: describe(error) }
          }
        }
        return { kind: 'error', text: describe(error) }
      }
    },
  }
}
