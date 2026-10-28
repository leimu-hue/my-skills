import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/host/skills/service.js'
import { saveScene, setWorkspaceScene } from '../dist/host/scenes/service.js'
import { createSceneGate, deniedToolsFor, serverOfTool } from '../dist/host/scenes/gate.js'
import { patchPathOf } from '../dist/host/mcp/service.js'

const PATCH = `- insert:
    - id: rea-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rea
        command: cmd.exe
    - id: other-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: other
        command: cmd.exe
`

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'sm-gate-'))
  const dshHome = join(base, 'dsh')
  await mkdir(join(dshHome, 'skills', 'alpha'), { recursive: true })
  await writeFile(join(dshHome, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: alpha skill\n---\nbody\n')
  await writeFile(patchPathOf(dshHome), PATCH)
  const workspace = join(base, 'repo')
  const otherWorkspace = join(base, 'other-repo')
  await mkdir(workspace, { recursive: true })
  await mkdir(otherWorkspace, { recursive: true })
  const service = createService({ dshHome, agentsHome: join(base, 'agents'), log: () => {} })
  return { base, dshHome, service, workspace, otherWorkspace }
}

const TOOLS = ['read_file', 'mcp__rea__search', 'mcp__other__deploy', 'mcp__unknown__thing']

/** 一个假 agent：只带 id、cwd、作用域里的 tools 服务。 */
function fakeAgent(id, cwd, calls) {
  return {
    id,
    session: { header: { cwd } },
    ctx: {
      get: (name) => (name === 'tools'
        ? {
          restrict(filter) {
            calls.push(filter)
            return () => calls.push({ disposed: filter })
          },
        }
        : undefined),
    },
  }
}

test('tool names map back to their server by prefix, longest match wins', () => {
  assert.equal(serverOfTool('mcp__rea__search', ['rea', 'rea_extra']), 'rea')
  assert.equal(serverOfTool('mcp__rea_extra__x', ['rea', 'rea_extra']), 'rea_extra')
  assert.equal(serverOfTool('mcp__unknown__thing', ['rea']), '', 'an unrecognized mcp__ tool still counts as MCP')
  assert.equal(serverOfTool('read_file', ['rea']), undefined, 'non-MCP tools are never touched')
})

test('an exclusive scene denies every MCP tool except the listed server', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: ['rea-mcp'], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  const { deny } = await deniedToolsFor(dshHome, workspace, TOOLS)
  assert.deepEqual(deny.sort(), ['mcp__other__deploy', 'mcp__unknown__thing'].sort())
  assert.equal(deny.includes('read_file'), false, 'non-MCP tools stay visible')
  assert.equal(deny.includes('mcp__rea__search'), false, 'the listed server keeps its tools')
})

test('a scene may name a server by its serverName instead of its patch id', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'by-name', skills: [], mcp: ['rea'], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'by-name')
  const { deny } = await deniedToolsFor(dshHome, workspace, TOOLS)
  assert.equal(deny.includes('mcp__rea__search'), false)
  assert.equal(deny.includes('mcp__other__deploy'), true)
})

test('no active scene means no restriction, and another workspace is unaffected', async () => {
  const { dshHome, workspace, otherWorkspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: ['rea-mcp'], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  assert.deepEqual((await deniedToolsFor(dshHome, otherWorkspace, TOOLS)).deny, [], 'a different workspace keeps every tool')
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, null)
  assert.deepEqual((await deniedToolsFor(dshHome, workspace, TOOLS)).deny, [], 'exiting lifts the mask')
})

test('a non-exclusive scene never narrows MCP tools', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'additive', skills: [], mcp: ['rea-mcp'], exclusive: false })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'additive')
  assert.deepEqual((await deniedToolsFor(dshHome, workspace, TOOLS)).deny, [])
})

test('the gate installs a restriction per agent, idempotently, and lifts it on dispose', async () => {
  const { dshHome, workspace, otherWorkspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: ['rea-mcp'], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  const calls = []
  const inside = fakeAgent('session-a', workspace, calls)
  const outside = fakeAgent('session-b', otherWorkspace, calls)
  const gate = createSceneGate({
    dshHome,
    globalToolNames: () => TOOLS,
    toolsScopeOf: (agent) => agent?.ctx?.get('tools'),
    cwdOf: (agent) => agent?.session?.header?.cwd ?? '',
    liveAgents: () => [inside, outside],
  })

  await gate.refresh()
  assert.equal(calls.length, 1, 'only the agent inside the workspace is restricted')
  assert.deepEqual(calls[0].deny.sort(), ['mcp__other__deploy', 'mcp__unknown__thing'].sort())

  await gate.refresh()
  assert.equal(calls.length, 1, 're-refreshing with the same state does not stack another restriction')

  gate.uninstall(inside)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].disposed, calls[0], 'the exact restriction is lifted')
  assert.deepEqual(gate.deniedToolsOf(inside), [])
})

test('the gate follows a changing tool set without needing a restart', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: ['rea-mcp'], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  let tools = ['mcp__rea__search']
  const calls = []
  const agent = fakeAgent('session-a', workspace, calls)
  const gate = createSceneGate({
    dshHome,
    globalToolNames: () => tools,
    toolsScopeOf: (a) => a?.ctx?.get('tools'),
    cwdOf: (a) => a?.session?.header?.cwd ?? '',
    liveAgents: () => [agent],
  })

  await gate.refresh()
  assert.equal(calls.length, 0, 'everything currently registered belongs to the scene')

  // 另一台服务器连上来了：它不在场景里，必须被遮掉。
  tools = ['mcp__rea__search', 'mcp__other__deploy']
  await gate.refresh()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].deny, ['mcp__other__deploy'])
})

test('a failing restrict() is logged and never breaks the plugin', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: [], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  const logs = []
  const agent = {
    id: 'session-a',
    session: { header: { cwd: workspace } },
    ctx: { get: () => ({ restrict() { throw new Error('unknown global tool "mcp__gone__x"') } }) },
  }
  const gate = createSceneGate({
    dshHome,
    globalToolNames: () => ['mcp__rea__search'],
    toolsScopeOf: (a) => a?.ctx?.get('tools'),
    cwdOf: (a) => a?.session?.header?.cwd ?? '',
    liveAgents: () => [agent],
    log: (event, detail) => logs.push(`${event}: ${detail}`),
  })

  await assert.doesNotReject(() => gate.refresh())
  assert.ok(logs.some((line) => line.includes('restrict() failed')), 'the failure is reported, not swallowed silently')
})

test('a session without a workspace is never restricted', async () => {
  const { dshHome, workspace } = await fixture()
  await saveScene(dshHome, { name: 'only-rea', skills: [], mcp: [], exclusive: true })
  await setWorkspaceScene(dshHome, createService({ dshHome, agentsHome: join(dshHome, 'agents'), log: () => {} }), workspace, 'only-rea')

  const calls = []
  const agent = fakeAgent('session-a', '', calls)
  const gate = createSceneGate({
    dshHome,
    globalToolNames: () => TOOLS,
    toolsScopeOf: (a) => a?.ctx?.get('tools'),
    cwdOf: (a) => a?.session?.header?.cwd ?? '',
    liveAgents: () => [agent],
  })
  await gate.refresh()
  assert.equal(calls.length, 0)
})
