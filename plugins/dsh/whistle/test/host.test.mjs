/**
 * Host 这一半的行为，锚定在构建产物上。
 *
 * 用 `npm test` 运行（会先构建）：这些测试导入 `dist/`，因为那才是 Harness
 * 实际加载的东西——一次重构如果源码仍能编译、却改变了工具结果或 payload 形状，
 * 就必须在这里失败。
 *
 * 本机不需要装 whistle：所有测试用 `apiFactory` 注入假 API，因此也能覆盖
 * 「whistle 没装 / 没启动 / 版本太低」这三条真实报错路径。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WhistleClient } from '../dist/host/whistle/client.js'
import { compareVersions } from '../dist/host/whistle/client.js'
import { collectSessions, findSession, parseHeaderFilter } from '../dist/host/whistle/query.js'
import { prettyBody, rulePreview, sessionLine, sessionTableHeader } from '../dist/host/whistle/format.js'
import { sameRuleText, summariseRules } from '../dist/host/whistle/rules.js'
import { createTools } from '../dist/host/tools/index.js'
import { apply } from '../dist/host/index.js'

/* ------------------------------- 假 API -------------------------------- */

function session(id, patch = {}) {
  return {
    id,
    startTime: Number.parseInt(id, 10),
    url: 'https://api.example.com/v1/users',
    isHttps: true,
    req: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    },
    res: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
      size: 1024,
    },
    total: 34,
    ...patch,
  }
}

function fakeWhistle(patch = {}) {
  const calls = { sessions: [], frames: [], turnOn: 0, turnOff: 0, added: [], selected: [], unselected: [] }
  const rules = new Map([['dev-rules', '* api.example.com 127.0.0.1:8080']])

  const api = {
    network: {
      async getStatus() {
        return { version: '2.10.14' }
      },
      async getSessions(options) {
        calls.sessions.push(options)
        return patch.getSessions === undefined ? [session('1784905385300-003')] : patch.getSessions(options)
      },
      async getFrames(options) {
        calls.frames.push(options)
        return patch.getFrames === undefined ? [{ frameId: '1784903620142-000', opcode: 1, length: 12, body: '{"t":1}' }] : patch.getFrames(options)
      },
    },
    rules: {
      async getStatus() {
        return {
          disabled: false,
          pluginsDisabled: false,
          multiSelect: false,
          laterRulesFirst: false,
          list: [{ name: 'dev-rules', selected: true }],
        }
      },
      async turnOn() {
        calls.turnOn += 1
      },
      async turnOff() {
        calls.turnOff += 1
      },
      async getList() {
        return [...rules].map(([name, value]) => ({ name, value, selected: true }))
      },
      async get(name) {
        return rules.has(name) ? rules.get(name) : null
      },
      async add(name, value, selected) {
        calls.added.push({ name, value, selected })
        if (patch.addAppends === true) rules.set(name, (rules.get(name) ?? '') + '\n' + value)
        else rules.set(name, value)
      },
      async select(name) {
        calls.selected.push(name)
        return rules.has(name)
      },
      async unselect(name) {
        calls.unselected.push(name)
        return true
      },
      async moveToTop() {
        return true
      },
      async isMultiSelect() {
        return false
      },
      async setMultiSelect() {},
      async setLaterFirst() {},
    },
    values: {
      async getList() {
        return [{ name: 'target', value: '127.0.0.1:8080' }]
      },
      async get(name) {
        return name === 'target' ? '127.0.0.1:8080' : null
      },
      async add() {},
    },
    plugins: {
      async getStatus() {
        return {}
      },
      async getList() {
        return [{ name: 'inspect', moduleName: 'whistle.inspect', version: '1.0.0', selected: true }]
      },
      async get(name) {
        return name === 'inspect' ? { name: 'inspect', moduleName: 'whistle.inspect' } : undefined
      },
    },
    utils: {
      getReqBody(raw) {
        return raw.req?.body ?? ''
      },
      getResBody(raw) {
        return raw.res?.body ?? ''
      },
      getText(frame) {
        return frame.body ?? ''
      },
      getTimings(raw) {
        return { total: raw.total ?? null }
      },
      getRules() {
        return ['* api.example.com 127.0.0.1:8080']
      },
    },
    async createUrl() {
      return 'http://127.0.0.1:8899/'
    },
    async isEnabledHTTPS() {
      return true
    },
    async setEnableHTTPS() {},
  }

  return { api: { ...api, ...(patch.api ?? {}) }, calls, rules }
}

function toolOf(tools, name) {
  const tool = tools.find((item) => item.name === name)
  assert.ok(tool !== undefined, 'missing tool ' + name)
  return tool
}

/** 工具的 execute 只需要一个能给出 `signal` 的 exec。 */
const exec = {}

/* --------------------------------- 客户端 -------------------------------- */

test('client: version gate rejects old whistle, then retries after an upgrade', async () => {
  let version = '2.9.0'
  const { api } = fakeWhistle()
  api.network.getStatus = async () => ({ version })
  const client = new WhistleClient({ apiFactory: async () => api })

  await assert.rejects(client.api(), (error) => {
    assert.equal(error.code, 'version')
    assert.match(error.message, /2\.9\.0/)
    assert.match(error.hint, /npm install -g whistle@latest/)
    return true
  })

  /* 失败不缓存：升级后同一个实例的下一次调用就该成功。 */
  version = '2.10.7'
  const connected = await client.api()
  assert.equal(connected.version, '2.10.7')
  assert.equal(client.version, '2.10.7')
})

test('client: a stopped proxy is reported with the command that starts it', async () => {
  const { api } = fakeWhistle()
  api.network.getStatus = async () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:8899')
    error.code = 'ECONNREFUSED'
    throw error
  }
  const client = new WhistleClient({ apiFactory: async () => api })
  await assert.rejects(client.api(), (error) => {
    assert.equal(error.code, 'connection')
    assert.match(error.hint, /w2 start/)
    return true
  })
})

test('client: a hung call times out instead of stalling the turn', async () => {
  const { api } = fakeWhistle()
  api.network.getStatus = () => new Promise(() => {})
  const client = new WhistleClient({ apiFactory: async () => api, timeoutMs: 40 })
  await assert.rejects(client.api(), (error) => {
    assert.equal(error.code, 'timeout')
    return true
  })
})

test('client: a missing CLI is distinguished from a stopped proxy', async () => {
  const client = new WhistleClient({
    apiFactory: async () => {
      throw new Error("'w2' is not recognized as an internal or external command")
    },
  })
  await assert.rejects(client.api(), (error) => {
    assert.equal(error.code, 'missing')
    assert.match(error.hint, /npm install -g whistle/)
    return true
  })
})

test('client: version comparison ignores prerelease suffixes', () => {
  assert.equal(compareVersions('2.10.14', '2.10.7'), 1)
  assert.equal(compareVersions('2.10.7', '2.10.7'), 0)
  assert.equal(compareVersions('v2.9.9-beta.3', '2.10.7'), -1)
  assert.equal(compareVersions('3.0.0', '2.10.7'), 1)
})

/* --------------------------------- 查询 --------------------------------- */

test('query: paging follows the cursor only while a page comes back full', async () => {
  const first = Array.from({ length: 120 }, (_, index) => session('1784905385300-' + String(index).padStart(3, '0')))
  const second = [session('1784905385400-001'), session('1784905385400-002')]
  const pages = [first, second]
  const seen = []
  const { api } = fakeWhistle({
    getSessions(options) {
      seen.push(options)
      return pages.shift() ?? []
    },
  })

  const rows = await collectSessions(api, {}, 200)
  assert.equal(rows.length, 122)
  assert.equal(seen.length, 2)
  assert.equal(seen[1].startId, first[119].id, 'the next page starts after the last id of the previous one')
  assert.equal(seen[1].startTime, undefined)
})

test('query: latest asks once, however full the page is', async () => {
  const { api, calls } = fakeWhistle({
    getSessions: () => Array.from({ length: 120 }, (_, index) => session('1784905385300-' + index)),
  })
  const rows = await collectSessions(api, { latest: true }, 200)
  assert.equal(rows.length, 120)
  assert.equal(calls.sessions.length, 1)
})

test('query: an id is found through its timestamp window', async () => {
  const target = session('1784905385300-003')
  const { api, calls } = fakeWhistle({ getSessions: () => [target] })
  const found = await findSession(api, target.id)
  assert.equal(found, target)
  assert.equal(calls.sessions[0].startTime, Number.parseInt(target.id, 10) - 1)
})

test('query: header filters accept a bare name and a name=substring pair', () => {
  assert.deepEqual(parseHeaderFilter('x-token'), { name: 'x-token' })
  assert.deepEqual(parseHeaderFilter('x-token=abc'), { name: 'x-token', subValue: 'abc' })
  assert.equal(parseHeaderFilter('   '), undefined)
})

/* --------------------------------- 格式化 -------------------------------- */

test('format: a session row carries the fields an agent compares', () => {
  const { api } = fakeWhistle()
  const line = sessionLine(api, session('1784905385300-003'))
  assert.match(line, /^1784905385300-003/)
  assert.match(line, /POST/)
  assert.match(line, /200/)
  assert.match(line, /1\.0K/)
  assert.match(line, /34ms/)
  assert.match(line, /https:\/\/api\.example\.com\/v1\/users$/)
  assert.match(sessionTableHeader(), /id\s+time\s+method\s+code\s+size\s+took\s+url/)
})

test('format: JSON bodies are pretty-printed, other text is left alone', () => {
  assert.equal(prettyBody('{"ok":true}', 1000), '{\n  "ok": true\n}')
  assert.equal(prettyBody('plain text', 1000), 'plain text')
  assert.equal(prettyBody('', 1000), '(empty)')
})

test('format: a rule preview stays on one line', () => {
  assert.equal(rulePreview('* a.com 1.1.1.1\n* b.com 2.2.2.2'), '* a.com 1.1.1.1  … 2 lines')
  assert.equal(rulePreview(''), '(empty)')
})

test('rules: summaries and text comparison tolerate line-ending differences', () => {
  assert.deepEqual(summariseRules({ list: [{ name: 'a', selected: true }, { name: 'b' }], disabled: true }), {
    disabled: true,
    pluginsDisabled: false,
    multiSelect: false,
    laterRulesFirst: false,
    selected: ['a'],
    files: [{ name: 'a', selected: true }, { name: 'b', selected: false }],
    total: 2,
  })
  assert.equal(sameRuleText('* a.com 1.1.1.1\r\n', '* a.com 1.1.1.1'), true)
  assert.equal(sameRuleText('* a.com', '* b.com'), false)
})

/* ---------------------------------- 工具 --------------------------------- */

test('tools: the listing is the seven whistle_ names, in reading order', () => {
  const tools = createTools(new WhistleClient({ apiFactory: async () => fakeWhistle().api }))
  assert.deepEqual(tools.map((tool) => tool.name), [
    'whistle_status',
    'whistle_sessions',
    'whistle_session',
    'whistle_frames',
    'whistle_rules',
    'whistle_values',
    'whistle_plugins',
  ])
})

test('tools: status tolerates a sub-query that the version does not have', async () => {
  const { api } = fakeWhistle()
  api.isEnabledHTTPS = async () => {
    throw new Error('404 not found')
  }
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const payload = JSON.parse(await toolOf(tools, 'whistle_status').execute({}, exec))
  assert.equal(payload.whistle.version, '2.10.14')
  assert.equal(payload.whistle.captureUrl, 'http://127.0.0.1:8899/')
  assert.equal(payload.whistle.httpsInterception, 'unknown', 'one broken probe must not fail the whole check')
  assert.deepEqual(payload.plugins.enabled, ['inspect'])
  assert.deepEqual(payload.ruleFiles, [{ name: 'dev-rules', selected: true }])
})

test('tools: sessions passes the filters through and renders one row each', async () => {
  const { api, calls } = fakeWhistle({
    getSessions: () => [session('1784905385300-003'), session('1784905385300-004')],
  })
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const text = await toolOf(tools, 'whistle_sessions').execute(
    { subUrl: '/v1', method: 'GET,POST', reqHeader: 'x-token=abc', statusCode: '200,304', count: 10 },
    exec,
  )
  assert.deepEqual(calls.sessions[0].subUrl, '/v1')
  assert.deepEqual(calls.sessions[0].reqHeader, { name: 'x-token', subValue: 'abc' })
  assert.deepEqual(calls.sessions[0].method, 'GET,POST')
  assert.equal(calls.sessions[0].statusCode, '200,304')
  assert.equal(text.split('\n').filter((line) => line.startsWith('1784905385300-')).length, 2)
  assert.match(text, /subUrl="\/v1"/)
})

test('tools: session detail matches rules, headers and pretty-printed bodies', async () => {
  const target = session('1784905385300-003')
  const { api } = fakeWhistle({ getSessions: () => [target] })
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const text = await toolOf(tools, 'whistle_session').execute({ id: target.id }, exec)
  assert.match(text, /id: 1784905385300-003/)
  assert.match(text, /matched rules:/)
  assert.match(text, /── response body \(application\/json\) ──/)
  assert.match(text, /"ok": true/)
})

test('tools: a session that scrolled out of the buffer fails with a next step', async () => {
  const { api } = fakeWhistle({ getSessions: () => [] })
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  await assert.rejects(
    toolOf(tools, 'whistle_session').execute({ id: '1784905385300-999' }, exec),
    (error) => {
      assert.match(error.message, /No captured session/)
      assert.match(error.message, /whistle_sessions/)
      return true
    },
  )
})

test('tools: frames render direction, opcode and body', async () => {
  const { api, calls } = fakeWhistle({ getFrames: () => [{ frameId: '1784903620142-000', fromClient: true, opcode: 1, length: 12, body: '{"t":1}' }] })
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const text = await toolOf(tools, 'whistle_frames').execute({ reqId: '1784885309943-086', from: 'client' }, exec)
  assert.equal(calls.frames[0].reqId, '1784885309943-086')
  assert.equal(calls.frames[0].from, 'client')
  assert.match(text, /1784903620142-000\s+C>S\s+1/)
  assert.match(text, /\{"t":1\}/)
})

test('tools: rules set verifies the read-back instead of trusting rules/add', async () => {
  const { api, calls } = fakeWhistle()
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const ok = JSON.parse(await toolOf(tools, 'whistle_rules').execute(
    { action: 'set', name: 'e2e', value: '* api.example.com 127.0.0.1:8080' },
    exec,
  ))
  assert.equal(ok.verified, true)
  assert.equal(ok.selected, true)
  assert.equal(calls.added[0].selected, true)

  /* 一个只追加不覆盖的 whistle：工具必须自己发现并说出来。 */
  const appending = fakeWhistle({ addAppends: true })
  const strict = createTools(new WhistleClient({ apiFactory: async () => appending.api }))
  const mismatch = JSON.parse(await toolOf(strict, 'whistle_rules').execute(
    { action: 'set', name: 'dev-rules', value: '* other.com 2.2.2.2' },
    exec,
  ))
  assert.equal(mismatch.verified, false)
  assert.match(mismatch.note, /append/)
})

test('tools: selecting a rule file also switches the engine on', async () => {
  const { api, calls } = fakeWhistle()
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const result = JSON.parse(await toolOf(tools, 'whistle_rules').execute({ action: 'select', name: 'dev-rules' }, exec))
  assert.equal(result.exists, true)
  assert.equal(calls.selected[0], 'dev-rules')
  assert.equal(calls.turnOn, 1)
  assert.equal(result.rules.selected[0], 'dev-rules')
})

test('tools: reading a rule file that does not exist says which action lists them', async () => {
  const { api } = fakeWhistle()
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  await assert.rejects(
    toolOf(tools, 'whistle_rules').execute({ action: 'get', name: 'ghost' }, exec),
    (error) => {
      assert.match(error.message, /does not exist/)
      assert.match(error.message, /action="list"/)
      return true
    },
  )
})

test('tools: an existing but empty rule file reads as (empty), not as missing', async () => {
  /* 真实 whistle 对空的 Default 文件返回 { selected: true }（没有 value）。 */
  const { api } = fakeWhistle()
  api.rules.get = async (name) => (name === 'Default' ? { selected: true } : null)
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const text = await toolOf(tools, 'whistle_rules').execute({ action: 'get', name: 'Default' }, exec)
  assert.equal(text, '# rules/Default\n(empty)')
})

test('tools: listing counts what rules/status knows, including files rules/list omits', async () => {
  const { api } = fakeWhistle()
  api.rules.getStatus = async () => ({
    list: [{ name: 'Default', selected: true }, { name: 'dev-rules', selected: true }],
  })
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const text = await toolOf(tools, 'whistle_rules').execute({ action: 'list' }, exec)
  assert.match(text, /rule files: 2\s+·\s+selected: 2/)
  assert.match(text, /rules\/list` omits them\): Default \(selected\)/)
})

test('tools: values list stays short and set reports whether it stuck', async () => {
  const { api } = fakeWhistle()
  const tools = createTools(new WhistleClient({ apiFactory: async () => api }))
  const listed = await toolOf(tools, 'whistle_values').execute({ action: 'list' }, exec)
  assert.match(listed, /values: 1/)
  assert.match(listed, /target/)
  const written = JSON.parse(await toolOf(tools, 'whistle_values').execute(
    { action: 'set', name: 'target', value: '127.0.0.1:8080' },
    exec,
  ))
  assert.equal(written.verified, true)
})

test('tools: plugins are read-only and report selection state', async () => {
  const tools = createTools(new WhistleClient({ apiFactory: async () => fakeWhistle().api }))
  const text = await toolOf(tools, 'whistle_plugins').execute({ action: 'list' }, exec)
  assert.match(text, /plugins: 1/)
  assert.match(text, /inspect/)
  assert.deepEqual(toolOf(tools, 'whistle_plugins').parameters.properties.action.enum, ['list', 'get'])
})

/* ---------------------------------- 接线 --------------------------------- */

test('plugin: apply registers every tool through ctx.tools and cleans up on dispose', () => {
  const registered = []
  const effects = []
  const ctx = {
    tools: {
      register(tool) {
        registered.push(tool)
        return () => {}
      },
    },
    effect(create, label) {
      effects.push({ label, dispose: create() })
    },
  }

  apply(ctx, {})

  assert.equal(registered.length, 7)
  assert.equal(new Set(registered.map((tool) => tool.name)).size, 7, 'tool names must be unique')
  assert.equal(effects.length, 1)
  assert.match(effects[0].label, /whistle/)
  assert.equal(typeof effects[0].dispose, 'function')

  /* 参数 schema 是注册表唯一发给模型的东西：必填必须体现在 JSON Schema 上。 */
  const detail = registered.find((tool) => tool.name === 'whistle_session')
  assert.deepEqual(detail.parameters.required, ['id'])
})
