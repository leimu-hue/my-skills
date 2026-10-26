import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteMcpServer, loadMcp, parsePatch, patchPathOf, setMcpEnabled } from '../dist/host/mcp/service.js'

const REAL_WORLD = `- insert:
    - id: rea-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: rea
        transport: stdio
        command: cmd.exe
        args:
          - /d
          - /c
          - npx
          - -y
          - rea-agents@6.7.0
          - mcp
# dsh-plugin-tool-management:disable:rea-mcp
- id: rea-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  disabled: true
`

async function homeWith(patch) {
  const base = await mkdtemp(join(tmpdir(), 'sm-mcp-'))
  const dshHome = join(base, 'dsh')
  await mkdir(dshHome, { recursive: true })
  if (patch !== null) await writeFile(patchPathOf(dshHome), patch)
  return { base, dshHome }
}

test('parses an insert block plus a later override: the last row wins', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  const state = await loadMcp(dshHome)
  assert.equal(state.servers.length, 1)
  const server = state.servers[0]
  assert.equal(server.id, 'rea-mcp')
  assert.equal(server.name, 'rea')
  assert.equal(server.transport, 'stdio')
  assert.equal(server.command, 'cmd.exe')
  assert.deepEqual(server.args, ['/d', '/c', 'npx', '-y', 'rea-agents@6.7.0', 'mcp'])
  assert.equal(server.enabled, false, 'the trailing disabled: true wins')
  assert.equal(server.declaredAt, 'user')
})

test('enabling writes an explicit disabled:false override at the end of the file', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  const result = await setMcpEnabled(dshHome, 'rea-mcp', true)
  assert.equal(result.changed, true)
  assert.ok(result.backup !== null, 'a backup must be written before the patch')

  const text = await readFile(patchPathOf(dshHome), 'utf8')
  assert.match(text, /# >>> tool-center:mcp >>>/)
  assert.match(text, /disabled: false/)
  // 我们那段在文件末尾，才能压过用户上面那条 disabled: true
  assert.ok(text.trimEnd().endsWith('# <<< tool-center:mcp <<<'))

  const state = await loadMcp(dshHome)
  assert.equal(state.servers[0].enabled, true)
  assert.deepEqual(state.overridden, ['rea-mcp'])

  const backups = await readdir(join(dshHome, 'tool-center', 'backups'))
  assert.equal(backups.length, 1)
})

test('disabling then enabling round-trips and stays idempotent', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  const off = await setMcpEnabled(dshHome, 'rea-mcp', false)
  assert.equal(off.changed, false, 'already off')
  const on = await setMcpEnabled(dshHome, 'rea-mcp', true)
  assert.equal(on.changed, true)
  const again = await setMcpEnabled(dshHome, 'rea-mcp', true)
  assert.equal(again.changed, false, 'idempotent')
  const text = await readFile(patchPathOf(dshHome), 'utf8')
  assert.equal((text.match(/tool-center:override:rea-mcp/g) ?? []).length, 1, 'no duplicate override blocks')
})

test('the user declaration is never rewritten, only overridden', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  await setMcpEnabled(dshHome, 'rea-mcp', true)
  const text = await readFile(patchPathOf(dshHome), 'utf8')
  assert.match(text, /- id: rea-mcp\n {6}name: "@deepseek-ai\/dsh-mcp-client"/, 'original insert block is intact')
  assert.match(text, /rea-agents@6\.7\.0/)
})

test('deleting removes the declaration block and the override, and drops an empty insert', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  await setMcpEnabled(dshHome, 'rea-mcp', true)
  const result = await deleteMcpServer(dshHome, 'rea-mcp')
  assert.equal(result.id, 'rea-mcp')
  const text = await readFile(patchPathOf(dshHome), 'utf8')
  assert.doesNotMatch(text, /rea-mcp/)
  assert.doesNotMatch(text, /- insert:/, 'the now-empty insert list is removed too')
  const state = await loadMcp(dshHome)
  assert.deepEqual(state.servers, [])
})

test('refuses to delete when only an override row exists', async () => {
  const onlyOverride = `- id: ghost
  name: '@deepseek-ai/dsh-mcp-client'
  disabled: true
`
  const { dshHome } = await homeWith(onlyOverride)
  await assert.rejects(() => deleteMcpServer(dshHome, 'ghost'), /只有覆盖行、没有声明/)
})

test('an unknown id is refused instead of inventing a row', async () => {
  const { dshHome } = await homeWith(REAL_WORLD)
  await assert.rejects(() => setMcpEnabled(dshHome, 'nope', true), /没有这台 MCP 服务器/)
})

test('a missing patch is reported, not treated as an error', async () => {
  const { dshHome } = await homeWith(null)
  const state = await loadMcp(dshHome)
  assert.equal(state.patchExists, false)
  assert.deepEqual(state.servers, [])
})

test('parses a remote (http) server with a url and no command', () => {
  const parsed = parsePatch(`- insert:
    - id: web-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: web
        transport: http
        url: https://example.test/mcp
`)
  const row = parsed.rows.find((candidate) => candidate.id === 'web-mcp')
  assert.ok(row !== undefined)
  assert.equal(row.serverName, 'web')
  assert.equal(row.transport, 'http')
  assert.equal(row.url, 'https://example.test/mcp')
  assert.equal(row.disabled, false)
})

test('multiple servers are listed independently', async () => {
  const patch = `- insert:
    - id: a
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: alpha
        command: node
    - id: b
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: beta
        command: node
`
  const { dshHome } = await homeWith(patch)
  const state = await loadMcp(dshHome)
  assert.deepEqual(state.servers.map((server) => server.name), ['alpha', 'beta'])
  await setMcpEnabled(dshHome, 'b', false)
  const after = await loadMcp(dshHome)
  assert.equal(after.servers.find((server) => server.id === 'a').enabled, true)
  assert.equal(after.servers.find((server) => server.id === 'b').enabled, false)
})
