/**
 * `/scene` —— 在**当前会话**里选择用哪个场景。
 *
 * 分工（与面板一致）：
 *   * **工作区**决定默认用哪个场景（工具中心「场景」页里为每个工作区选一次）；
 *   * **会话**可以在开始时 / 中途再选一次：用某个场景、明确不用、或者回到跟随工作区。
 *
 * 为什么用斜杠命令而不是再加一个工具：启停改变的是「模型能看见什么、能调什么」，属于
 * 能力面，应该由人按下按钮；斜杠命令正好是「人直接操作、不产生模型消息」的那条通道。
 *
 * 会话身份用共享解析（`scope/agent-scope.ts`）：子代理 / 侧聊沿 `parentSession` 上溯到
 * 根会话，作用域跟着那次对话走，**不接受**调用方另传路径或 id。
 */
import type { SkillService } from '../skills/service.js'
import { effectiveSceneOf, loadScenes, setSessionScene } from '../scenes/service.js'
import type { ScenesState } from '../scenes/service.js'
import { rootSessionIdOf, workspaceOfAgent } from '../scope/agent-scope.js'
import { DomainError, describe } from '../shared/result.js'

/** 命令执行回执：宿主只认 success / error 两种。 */
export interface SceneCommandResult {
  kind: 'success' | 'error'
  text: string
}

/** 命令运行时宿主交给我们的那部分 invocation。 */
export interface SceneCommandInvocation {
  agent?: {
    session?: {
      id?: unknown
      header?: { id?: unknown; cwd?: unknown; parentSession?: unknown }
      meta?: { cwd?: unknown }
    }
  }
  rawInput?: string
}

export interface SceneCommandDeps {
  dshHome: string
  service: SkillService
  /** 场景变了之后通知接线层：工具闸门要按新状态重算（正在跑的会话下一轮生效）。 */
  scenesChanged?: () => void
}

const USAGE = '用法：/scene（查看当前场景）· /scene <名字>（本会话用它）· /scene off（本会话不用）· /scene follow（跟随工作区）'

/** 会话所在的工作区（子会话上溯到根会话）。 */
export function workspaceOf(invocation: SceneCommandInvocation): string {
  return workspaceOfAgent(invocation.agent)
}

/** 这个会话的根会话 id。 */
export function sessionOf(invocation: SceneCommandInvocation): string | null {
  return rootSessionIdOf(invocation.agent)
}

/** 列出所有场景，并标出「本会话用的是哪个、谁决定的」。 */
function describeScenes(state: ScenesState, workspace: string, sessionId: string | null): string {
  const effective = effectiveSceneOf(state, workspace, sessionId ?? undefined)
  const source = effective.source === 'session'
    ? '本会话自己选的'
    : (effective.source === 'workspace' ? '跟随工作区默认' : '')
  if (state.scenes.length === 0) {
    return `还没有场景。\n在工具中心「场景」页新建一个，再为工作区选择它。\n\n${USAGE}`
  }
  const lines = state.scenes.map((scene) => {
    const marks: string[] = []
    if (scene.name === effective.name) marks.push('生效中')
    const workspaceDefault = state.active[workspace] === scene.name
    if (workspaceDefault && scene.name !== effective.name) marks.push('工作区默认')
    const detail = [
      scene.skills.length > 0 ? `技能 ${scene.skills.length}` : '',
      scene.mcp.length > 0 ? `MCP ${scene.mcp.length}` : '',
      scene.prompt === null ? '' : `提示词 ${scene.prompt}`,
    ].filter((part) => part !== '').join(' · ')
    return `- ${scene.name}${marks.length === 0 ? '' : `  [${marks.join(' · ')}]`}${detail === '' ? '' : `\n  ${detail}`}`
  })
  return [
    `工作区：${workspace}`,
    effective.name === null ? '当前没有生效的场景。' : `当前场景：${effective.name}${source === '' ? '' : `（${source}）`}`,
    '',
    ...lines,
    '',
    USAGE,
  ].join('\n')
}

/** 把一次设置的结果说清楚（含「没有改动」与警告）。 */
function reportText(lines: string[], warnings: string[]): string {
  const text = lines.filter((line) => line !== '').join('\n')
  return warnings.length === 0 ? text : `${text}\n\n注意：${warnings.join('\n注意：')}`
}

export function createSceneCommand(deps: SceneCommandDeps) {
  return {
    name: 'scene',
    description: '在当前会话里选择用哪个场景（技能 + MCP 工具）',
    input: { hint: '[<名字>|off|follow]' },
    handler: async (invocation: SceneCommandInvocation): Promise<SceneCommandResult> => {
      const workspace = workspaceOf(invocation)
      if (workspace === '') {
        return {
          kind: 'error',
          text: '这个会话没有工作区目录，场景无法使用。/scene 只对「在某一个项目目录里打开的会话」生效。',
        }
      }
      const sessionId = sessionOf(invocation)
      if (sessionId === null) {
        return { kind: 'error', text: '拿不到这个会话的身份，无法保存会话级选择。' }
      }

      const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim() : ''
      const keyword = raw.toLowerCase()

      try {
        if (raw === '' || keyword === 'list') {
          return { kind: 'success', text: describeScenes(await loadScenes(deps.dshHome), workspace, sessionId) }
        }

        // 跟随工作区 = 删掉会话选择。
        if (keyword === 'follow' || keyword === 'auto' || keyword === 'reset') {
          const report = await setSessionScene(deps.dshHome, deps.service, sessionId, workspace, undefined)
          deps.scenesChanged?.()
          return {
            kind: 'success',
            text: reportText([
              '已改为跟随工作区。',
              `工作区：${workspace}`,
              report.scene === null ? '这个工作区没有默认场景，所以现在不用场景。' : `现在用「${report.scene}」（工作区默认）。`,
            ], report.warnings),
          }
        }

        // 明确不用（会压过工作区的默认场景）。
        if (keyword === 'off' || keyword === 'exit' || keyword === 'leave' || keyword === 'none') {
          const report = await setSessionScene(deps.dshHome, deps.service, sessionId, workspace, null)
          deps.scenesChanged?.()
          return {
            kind: 'success',
            text: reportText(['本会话已不使用场景。', `工作区：${workspace}`, '技能与 MCP 工具恢复成场景之外的常态。'], report.warnings),
          }
        }

        const report = await setSessionScene(deps.dshHome, deps.service, sessionId, workspace, raw)
        deps.scenesChanged?.()
        return {
          kind: 'success',
          text: reportText([
            `本会话已使用「${report.scene ?? raw}」。`,
            `工作区：${workspace}`,
            report.applied.skills === 0 ? '这个场景没有勾选技能。' : `技能白名单 ${report.applied.skills} 条在这个会话里生效。`,
            report.applied.mcp === 0 ? '' : `MCP 工具：这个会话只保留勾选的 ${report.applied.mcp} 台服务器的工具。`,
            report.changed ? '' : '（状态没有变化，本来就是这样）',
          ], report.warnings),
        }
      } catch (cause) {
        if (cause instanceof DomainError) return { kind: 'error', text: `${cause.message}\n${USAGE}` }
        return { kind: 'error', text: `场景操作失败：${describe(cause)}` }
      }
    },
  }
}

