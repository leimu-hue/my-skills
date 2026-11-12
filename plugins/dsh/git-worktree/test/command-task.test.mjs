/**
 * `/worktree create … -- 任务` 的守门测试。
 *
 * 两件事必须钉住：
 *   1. `--` 之后的文字**原样**成为任务（多行、连续空格都不能被 token 化吃掉）；
 *   2. 任务发失败时回执必须说出来——创建成功但任务丢了，比直接报错更容易被忽略。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorktreeCommand } from '../dist/host/commands/worktree.js'
import { makeRepository, TIMEOUT } from './helpers.mjs'

function fakeService(reply = {}) {
  const calls = []
  return {
    calls,
    create: async (input) => {
      calls.push(input)
      return {
        created: true,
        worktree: {
          id: 'w1',
          name: input.name,
          origin: 'managed',
          repository: '/repo',
          repositoryName: 'repo',
          path: '/repo/.worktrees/' + input.name,
          branch: 'worktree/' + input.name,
          headOid: null,
          mode: 'branch',
          baseOid: 'a'.repeat(40),
          baseBranch: 'main',
          createdAt: 0,
          state: 'ready',
          dirty: 0,
          files: 0,
          ahead: 0,
          behind: 0,
          locked: false,
          prunable: false,
          workspaceId: null,
          current: false,
        },
        copied: [],
        ignoreAdded: false,
        commands: [],
        workspaceId: null,
        sessionId: 'abcdef12-3456-7890-abcd-ef1234567890',
        ...reply,
      }
    },
  }
}

function invocation(cwd, rawInput) {
  return { agent: { session: { header: { cwd } } }, rawInput }
}

test('the text after -- reaches service.create verbatim', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-cmd-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = fakeService()
    const command = createWorktreeCommand(service, TIMEOUT)

    const result = await command.handler(invocation(repository, 'create fix main -- 修一下登录 超时\n第二行  -x'))
    assert.equal(result.kind, 'success')
    assert.equal(service.calls.length, 1)
    assert.equal(service.calls[0].name, 'fix')
    assert.equal(service.calls[0].base, 'main')
    assert.equal(service.calls[0].repository, realpathSync(repository))
    /* `--` 之后一律原样：换行、连续空格、看起来像 flag 的 `-x` 都不解析。 */
    assert.equal(service.calls[0].task, '修一下登录 超时\n第二行  -x')
    assert.match(result.text, /任务已发进那个会话的第一轮/)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('without -- nothing is offered as a task', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-cmd-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = fakeService()
    const command = createWorktreeCommand(service, TIMEOUT)

    const result = await command.handler(invocation(repository, 'create quiet'))
    assert.equal(result.kind, 'success')
    assert.equal(service.calls[0].task, undefined)
    assert.doesNotMatch(result.text, /任务/)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('a failed delivery is reported instead of silently dropped', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-worktree-cmd-'))
  try {
    const repository = join(workspace, 'repo')
    makeRepository(repository)
    const service = fakeService({ taskError: '这个 Host 的 agent 不支持 followup' })
    const command = createWorktreeCommand(service, TIMEOUT)

    const result = await command.handler(invocation(repository, 'create lost -- 做点事'))
    assert.equal(result.kind, 'success')
    assert.match(result.text, /任务没发出去/)
    assert.match(result.text, /不支持 followup/)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})
