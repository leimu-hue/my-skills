import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName, inject } from '../dist/host/index.js'

/** 一个最小宿主上下文：够观察插件注册了什么。 */
function fakeHost() {
  const providers = []
  const agentProviders = []
  const tools = []
  const routes = []
  const disposers = []
  /** 活着的 agent（宿主的 `agents.list()`；场景闸门刷新时按它重算）。 */
  const agents = []
  const services = new Map()
  const events = new Map()
  /** 插件通过 ctx.emit 发出去的事件（远端转发用）。 */
  const emitted = []
  /** 宿主技能注册表的摘要（`skills.list()` 的返回值）。 */
  const registry = { candidates: [] }

  const ctx = {
    get(serviceName) {
      return services.get(serviceName)
    },
    emit(event, ...args) {
      emitted.push({ event, args })
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    on(event, listener) {
      const list = events.get(event) ?? []
      list.push(listener)
      events.set(event, list)
      return () => {
        const current = events.get(event) ?? []
        events.set(event, current.filter((item) => item !== listener))
      }
    },
    logger: { warn() {}, info() {} },
  }

  services.set('skills', {
    async list() {
      return registry.candidates
    },
    /** 宿主合并目录（核验用）。测试通过 `registry.snapshot` 决定它回什么。 */
    async snapshot() {
      return { skills: registry.snapshot ?? [], complete: true }
    },
    registerProvider(create) {
      const provider = create({ invalidate() {}, signal: new AbortController().signal })
      providers.push(provider)
      return () => {
        providers.splice(providers.indexOf(provider), 1)
      }
    },
  })
  services.set('tools', {
    register(definition) {
      tools.push(definition)
      return () => {
        tools.splice(tools.indexOf(definition), 1)
      }
    },
    /** 全局工具名（场景闸门算 deny 名单用）。测试通过 `registry.toolSchemas` 决定。 */
    schemas() {
      return (registry.toolSchemas ?? []).map((name) => ({ name }))
    },
  })
  services.set('webServer', {
    register(route) {
      routes.push(route)
      return () => {
        routes.splice(routes.indexOf(route), 1)
      }
    },
  })
  services.set('agents', { list: () => agents })
  services.set('sessions', { list: () => [{ id: 'session-abc', header: { agentPreset: 'standard' } }] })

  /** 某个 agent 作用域里的 skills 服务（与全局那份是两个层级）。 */
  const agentSkills = {
    registerProvider(create) {
      const provider = create({ invalidate() {}, signal: new AbortController().signal })
      agentProviders.push(provider)
      return () => {
        agentProviders.splice(agentProviders.indexOf(provider), 1)
      }
    },
  }

  const emit = (event, ...args) => {
    for (const listener of events.get(event) ?? []) listener(...args)
  }

  return { ctx, providers, agentProviders, agentSkills, tools, routes, disposers, registry, emitted, emit, agents }
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'sm-wire-'))
  const dshHome = join(base, 'dsh')
  const codexHome = join(base, 'codex')
  const claudeHome = join(base, 'claude')
  await mkdir(join(dshHome, 'skills', 'alpha'), { recursive: true })
  await writeFile(join(dshHome, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: first skill\n---\nalpha body\n')
  await mkdir(join(codexHome, 'skills', 'beta'), { recursive: true })
  await writeFile(join(codexHome, 'skills', 'beta', 'SKILL.md'), '---\nname: beta\ndescription: codex skill\n---\nbeta body\n')
  await mkdir(join(claudeHome, 'skills'), { recursive: true })
  return { base, dshHome, codexHome, claudeHome }
}

function fakeRequest(body, headers = {}) {
  const text = JSON.stringify(body)
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-plugin': 'tool-center', host: '127.0.0.1:55177', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(text, 'utf8')
    },
  }
}

function fakeResponse() {
  return {
    status: 0,
    payload: undefined,
    writeHead(status) {
      this.status = status
    },
    end(body) {
      this.payload = body === undefined ? undefined : JSON.parse(body)
    },
  }
}

test('the plugin declares its identity and required services', () => {
  assert.equal(pluginName, 'tool-center')
  assert.deepEqual(inject, ['skills', 'tools', 'webServer', 'agents', 'workspaceRegistry'])
})

test('apply registers one provider, one read-only tool and one exact route', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  assert.equal(host.providers.length, 1)
  assert.equal(host.providers[0].name, 'tool-center')
  // 默认只注册只读工具：启停是用户 / 场景的判断，不是模型的。
  assert.deepEqual(host.tools.map((tool) => tool.name).sort(), ['skill_list'])
  assert.ok(!host.tools.some((tool) => tool.name === 'skill_switch'), 'no switch tool unless the user opts in')
  assert.ok(!host.tools.some((tool) => tool.name === 'skill_read'), 'reading a body is the official `skill` tool job')
  assert.equal(host.routes.length, 1)
  assert.equal(host.routes[0].kind, 'exact')
  assert.equal(host.routes[0].path, '/tool-center/api')

  // provider 只回答宿主自己看不见的那些来源。
  const candidates = await host.providers[0].list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name).sort(), ['beta'])
})

test('registers a provider into each agent scope (Agent.id is a session-id string)', async () => {
  // 宿主把技能按查看方 agent 的作用域链合并：更近的层直接压过全局层，rank 不参与跨层比较。
  // 所以每个 agent 都必须有自己的覆盖 provider —— 之前只把数字 id 当 agent id，而现在的
  // Agent.id 是 SessionId 字符串，整段作用域注册被静默跳过，office 因此关不掉。
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  const agent = {
    id: 'session-abc',
    ctx: { get: (name) => (name === 'skills' ? host.agentSkills : undefined) },
  }
  host.emit('agent/created', { agent })
  assert.equal(host.agentProviders.length, 1, 'the agent scope gets its own tool-center provider')
  assert.equal(host.agentProviders[0].name, 'tool-center')

  // 同一个 agent 重复公告不该重复注册。
  host.emit('agent/created', { agent })
  assert.equal(host.agentProviders.length, 1)

  host.emit('agent/disposed', { agent })
  assert.equal(host.agentProviders.length, 0)
})

test('a skills/change event refreshes the host-published dirs (not every panel read)', async () => {
  const host = fakeHost()
  const f = await fixture()
  const pack = join(f.base, 'official-skills')
  await mkdir(join(pack, 'shipped'), { recursive: true })
  await writeFile(join(pack, 'shipped', 'SKILL.md'), '---\nname: shipped\ndescription: d\n---\nbody\n')
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  const readRoots = async () => {
    const response = fakeResponse()
    await host.routes[0].handler(fakeRequest({ op: 'state', args: {} }), response)
    return response.payload.data.roots
  }

  // 注册表里还没有它：面板没有宿主来源。
  assert.equal((await readRoots()).some((root) => root.kind === 'host'), false)

  // 宿主发布新目录并发 skills/change —— 我们只在那一刻重探一次。
  host.registry.candidates = [
    { name: 'shipped', resourceBase: { kind: 'directory', path: join(pack, 'shipped') } },
  ]
  host.emit('skills/change')
  await new Promise((resolve) => setTimeout(resolve, 400))

  const discovered = (await readRoots()).find((root) => root.kind === 'host')
  assert.equal(discovered?.path, pack)
  assert.deepEqual(discovered.skills.map((row) => row.declaredName), ['shipped'])
})

test('a skills change also nudges the browser `/` menu to refetch its cache', async () => {
  // DSH 的 ui-skill 按 session 缓存 remote.skills.list()，只认 agent-preset/selected
  // 与 connection/reset。策略变化后我们必须补发一次，否则面板里刚打开的技能在 `/`
  // 里仍然搜不到（要刷新整个页面才出现）。
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  host.emit('skills/change')
  await new Promise((resolve) => setTimeout(resolve, 400))

  const nudge = host.emitted.find((entry) => entry.event === 'agent-preset/selected')
  assert.ok(nudge !== undefined, 'the client skill cache must be invalidated')
  assert.equal(nudge.args[0], 'session-abc')
})

test('the route refuses a missing gate header and a wrong method', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  const handler = host.routes[0].handler

  const noGate = fakeRequest({ op: 'state' }, { 'x-dsh-plugin': '' })
  const noGateRes = fakeResponse()
  await handler(noGate, noGateRes)
  assert.equal(noGateRes.status, 403)
  assert.equal(noGateRes.payload.code, 'error.http.gate')

  const wrongMethod = fakeRequest({ op: 'state' })
  wrongMethod.method = 'GET'
  const wrongMethodRes = fakeResponse()
  await handler(wrongMethod, wrongMethodRes)
  assert.equal(wrongMethodRes.status, 405)
})

test('the route serves state, switches a skill, and refuses an unknown op', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  const handler = host.routes[0].handler

  const stateRes = fakeResponse()
  await handler(fakeRequest({ op: 'state', args: {} }), stateRes)
  assert.equal(stateRes.status, 200)
  assert.equal(stateRes.payload.ok, true)
  const roots = stateRes.payload.data.roots
  const local = roots.find((root) => root.key === 'local')
  assert.equal(local.skills.length, 1)
  assert.equal(local.skills[0].declaredName, 'alpha')

  const offRes = fakeResponse()
  await handler(fakeRequest({ op: 'set-skill', args: { root: 'local', name: 'alpha', enabled: false } }), offRes)
  assert.equal(offRes.status, 200)
  assert.equal(offRes.payload.data.changed, true)

  const afterRes = fakeResponse()
  await handler(fakeRequest({ op: 'state', args: {} }), afterRes)
  const alpha = afterRes.payload.data.roots.find((root) => root.key === 'local').skills[0]
  assert.equal(alpha.policy.modelInvocable, false)

  const unknownRes = fakeResponse()
  await handler(fakeRequest({ op: 'nope', args: {} }), unknownRes)
  assert.equal(unknownRes.status, 404)
  assert.equal(unknownRes.payload.code, 'error.op.unknown')

  const badArgsRes = fakeResponse()
  await handler(fakeRequest({ op: 'set-skill', args: { root: 'local', name: 'alpha', enabled: 'yes' } }), badArgsRes)
  assert.equal(respCode(badArgsRes), 'error.args.required')

  const reservedRes = fakeResponse()
  await handler(fakeRequest({ op: 'set-skill', args: { root: 'local', name: 'alpha', enabled: true, scope: 'session-1' } }), reservedRes)
  assert.equal(reservedRes.status, 501)
  assert.equal(reservedRes.payload.code, 'error.scope.reserved')
})

function respCode(response) {
  return response.payload?.code
}

test('the read-only tool explains why a skill is unavailable', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  const tool = (toolName) => host.tools.find((candidate) => candidate.name === toolName)
  const exec = { agent: { session: { header: { cwd: f.base } } } }

  const listed = await tool('skill_list').execute({}, exec)
  assert.equal(typeof listed.text, 'string')
  assert.match(listed.text, /alpha/)
  assert.match(listed.text, /beta/)
  // 默认含停用项，并给出原因 —— 这正是目录看不到的那部分。
  assert.match(listed.text, /enabled/)

  // 用户关掉一条之后，模型依然能看到它，并读到原因。
  const offRes = fakeResponse()
  await host.routes[0].handler(fakeRequest({ op: 'set-skill', args: { root: 'local', name: 'alpha', enabled: false } }), offRes)
  assert.equal(offRes.status, 200)
  const after = await tool('skill_list').execute({}, exec)
  assert.match(after.text, /disabled-by-user/, 'the reason is spelled out instead of the skill vanishing')
})

test('the switch tool only exists when the user opts in', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false, allowAgentSwitch: true })
  const tool = (toolName) => host.tools.find((candidate) => candidate.name === toolName)
  const exec = { agent: { session: { header: { cwd: f.base } } } }

  assert.deepEqual(host.tools.map((entry) => entry.name).sort(), ['skill_list', 'skill_switch'])

  const switched = await tool('skill_switch').execute({ name: 'alpha', enabled: false }, exec)
  assert.equal(switched.changed, true)
  assert.match(switched.text, /disabled/)

  const again = await tool('skill_switch').execute({ name: 'alpha', enabled: false }, exec)
  assert.equal(again.changed, false, 'a repeated switch is reported as a no-op')

  await assert.rejects(() => tool('skill_switch').execute({ name: 'beta', enabled: false, scope: 'session' }, exec), /reserved/)
})

test('verify asks the host registry, not our own panel view', async () => {
  // 面板开关只是「我们的意图」，用户真正想知道的是「宿主合并目录里还算不算数」。
  // 所以 verify 必须读 ctx.skills.snapshot()，并把它如实翻成三种结论。
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  const handler = host.routes[0].handler

  const verify = async (name) => {
    const res = fakeResponse()
    await handler(fakeRequest({ op: 'verify', args: { name } }), res)
    return res
  }

  // ① 宿主目录里没有它 → 真的关掉了。
  host.registry.snapshot = []
  const gone = await verify('alpha')
  assert.equal(gone.status, 200)
  assert.deepEqual(gone.payload.data, { name: 'alpha', inCatalog: false, modelInvocable: false, userInvocable: false })

  // ② 宿主目录里仍在、且对模型可调用 → 没关掉，必须如实说「仍可见」。
  host.registry.snapshot = [{ name: 'alpha', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } }]
  const stillOn = await verify('alpha')
  assert.equal(stillOn.payload.data.inCatalog, true)
  assert.equal(stillOn.payload.data.modelInvocable, true)
  assert.equal(stillOn.payload.data.provider, 'filesystem')

  // ③ 在目录里但只对人工可见 → 模型加载会被拒，回执也不该说「可见」。
  host.registry.snapshot = [{ name: 'alpha', provider: 'tool-center', invocation: { modelInvocable: false, userInvocable: true } }]
  const manual = await verify('alpha')
  assert.equal(manual.payload.data.inCatalog, true)
  assert.equal(manual.payload.data.modelInvocable, false)
  assert.equal(manual.payload.data.userInvocable, true)

  // ④ 没有名字是参数错误，不是 500。
  assert.equal(respCode(await verify('')), 'error.args.required')
})

test('verify degrades explicitly when the host skills service has no snapshot()', async () => {
  const host = fakeHost()
  const f = await fixture()
  // 把 snapshot 摘掉：老宿主 / 精简宿主。
  const skills = host.ctx.get('skills')
  delete skills.snapshot
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  const res = fakeResponse()
  await host.routes[0].handler(fakeRequest({ op: 'verify', args: { name: 'alpha' } }), res)
  assert.equal(res.status, 200)
  assert.equal(res.payload.ok, false)
  assert.equal(res.payload.code, 'error.verify.unavailable')
})

test('disposing the plugin removes every registration', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  assert.equal(host.providers.length, 1)
  for (const dispose of host.disposers) dispose()
  assert.equal(host.providers.length, 0)
  assert.equal(host.tools.length, 0)
  assert.equal(host.routes.length, 0)
})

test('the /scene command is registered with the host command service and disposed with it', async () => {
  const host = fakeHost()
  const f = await fixture()
  const commands = []
  host.ctx.get = ((original) => (serviceName) => (
    serviceName === 'commands'
      ? {
        register(definition) {
          commands.push(definition)
          return () => {
            commands.splice(commands.indexOf(definition), 1)
          }
        },
      }
      : original.call(host.ctx, serviceName)
  ))(host.ctx.get)

  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'scene')
  assert.equal(typeof commands[0].handler, 'function')

  for (const dispose of host.disposers) dispose()
  assert.equal(commands.length, 0)
})

test('a host without a command service still loads the plugin', async () => {
  const host = fakeHost()
  const f = await fixture()
  // fakeHost 默认没有 commands：注册必须降级，而不是把整个插件掀掉。
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  assert.equal(host.providers.length, 1)
  assert.ok(host.routes.length >= 1)
})

test('with cordis inject the command waits for the command service instead of racing it', async () => {
  const host = fakeHost()
  const f = await fixture()
  const commands = []
  const waits = []
  // 命令服务在 apply 之后才装好：只有 inject 那条路能注册成功。
  host.ctx.inject = (names, callback) => {
    waits.push(names)
    servicesForCommands()
    callback(host.ctx)
  }
  const servicesForCommands = () => {
    const original = host.ctx.get
    host.ctx.get = (serviceName) => (serviceName === 'commands'
      ? {
        register(definition) {
          commands.push(definition)
          return () => {
            commands.splice(commands.indexOf(definition), 1)
          }
        },
      }
      : original(serviceName))
  }

  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  assert.deepEqual(waits, [['commands']], 'the plugin declares the wait instead of polling')
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'scene')
})

test('scene-workspace over HTTP needs a workspace and applies the chosen scene', async () => {
  const host = fakeHost()
  const f = await fixture()
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })
  const handler = host.routes[0].handler

  const save = fakeResponse()
  await handler(fakeRequest({
    op: 'scene-save',
    args: { name: 'a', skills: [], exclusive: true },
  }), save)
  assert.equal(save.payload.ok, true)

  const noWorkspace = fakeResponse()
  await handler(fakeRequest({ op: 'scene-workspace', args: { workspace: '' } }), noWorkspace)
  assert.equal(noWorkspace.payload.ok, false)
  assert.equal(noWorkspace.payload.code, 'error.scene.workspace')

  const applied = fakeResponse()
  await handler(fakeRequest({ op: 'scene-workspace', args: { workspace: f.base, scene: 'a' } }), applied)
  assert.equal(applied.payload.ok, true)
  assert.equal(applied.payload.data.workspace, f.base)
  assert.equal(applied.payload.data.scene, 'a')

  const cleared = fakeResponse()
  await handler(fakeRequest({ op: 'scene-workspace', args: { workspace: f.base, scene: null } }), cleared)
  assert.equal(cleared.payload.ok, true)
  assert.equal(cleared.payload.data.scene, null)
})

test('an agent created inside the scene workspace gets the MCP tools of other servers restricted', async () => {
  const host = fakeHost()
  const f = await fixture()
  host.registry.toolSchemas = ['read_file', 'mcp__rea__search', 'mcp__other__deploy']
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  // 场景：整套切换 + 不列任何服务器 → 这个工作区里所有 MCP 工具都该被遮掉。
  const save = fakeResponse()
  await host.routes[0].handler(fakeRequest({
    op: 'scene-save',
    args: { name: 'no-mcp', workspace: f.base, skills: [], mcp: [], exclusive: true },
  }), save)
  assert.equal(save.payload.ok, true)
  const applyRes = fakeResponse()
  await host.routes[0].handler(fakeRequest({
    op: 'scene-workspace',
    args: { workspace: f.base, scene: 'no-mcp' },
  }), applyRes)
  assert.equal(applyRes.payload.ok, true)

  const calls = []
  const agent = {
    id: 'session-mcp',
    session: { header: { cwd: f.base } },
    ctx: {
      get: (name) => (name === 'tools'
        ? {
          restrict(filter) {
            calls.push(filter)
            return () => calls.push({ disposed: true })
          },
        }
        : undefined),
    },
  }
  host.emit('agent/created', { agent })
  await new Promise((resolve) => setTimeout(resolve, 150))

  assert.equal(calls.length, 1, 'the gate installed exactly one restriction')
  assert.deepEqual(calls[0].deny.sort(), ['mcp__other__deploy', 'mcp__rea__search'].sort())
  assert.equal(calls[0].deny.includes('read_file'), false, 'ordinary tools are untouched')

  host.emit('agent/disposed', { agent })
  assert.equal(calls.length, 2, 'disposing the agent lifts the restriction')
})

test('refreshing when the tool set grows only adds the newly visible tools to the deny list', async () => {
  const host = fakeHost()
  const f = await fixture()
  // 场景要引用一台真实声明的服务器，否则「只留它」会退化成「什么都不留」。
  await writeFile(join(f.dshHome, 'cordis.patch.yml'), `- insert:
    - id: rea-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rea
        command: cmd.exe
`)
  host.registry.toolSchemas = ['mcp__rea__search']
  apply(host.ctx, { dshHome: f.dshHome, claudeHome: f.claudeHome, codexHome: f.codexHome, watch: false })

  await host.routes[0].handler(fakeRequest({
    op: 'scene-save',
    args: { name: 'only-rea', workspace: f.base, skills: [], mcp: ['rea-mcp'], exclusive: true },
  }), fakeResponse())
  await host.routes[0].handler(fakeRequest({
    op: 'scene-workspace',
    args: { workspace: f.base, scene: 'only-rea' },
  }), fakeResponse())

  const calls = []
  const agent = {
    id: 'session-grow',
    session: { header: { cwd: f.base } },
    ctx: {
      get: (name) => (name === 'tools'
        ? { restrict(filter) { calls.push(filter); return () => undefined } }
        : undefined),
    },
  }
  host.emit('agent/created', { agent })
  host.agents.push(agent)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(calls.length, 0, 'the only registered tool belongs to the scene')

  // 另一台服务器连上来了 → tools/change → 重算，只遮它。
  host.registry.toolSchemas = ['mcp__rea__search', 'mcp__other__deploy']
  host.emit('tools/change')
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].deny, ['mcp__other__deploy'])
})

