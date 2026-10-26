import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name as pluginName, inject } from '../dist/host/index.js'

/** 一个最小宿主上下文：够观察插件注册了什么。 */
function fakeHost() {
  const providers = []
  const tools = []
  const routes = []
  const disposers = []
  const services = new Map()
  const events = new Map()

  const ctx = {
    get(serviceName) {
      return services.get(serviceName)
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
  })
  services.set('webServer', {
    register(route) {
      routes.push(route)
      return () => {
        routes.splice(routes.indexOf(route), 1)
      }
    },
  })
  services.set('agents', { list: () => [] })

  return { ctx, providers, tools, routes, disposers }
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
