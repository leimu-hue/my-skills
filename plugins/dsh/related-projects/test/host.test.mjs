/**
 * Host 这一半的行为，锚定在构建产物上。
 *
 * 用 `npm test` 运行（会先构建）：这些测试导入 `dist/`，因为那才是
 * Harness 实际加载的东西——一次重构如果源码仍能编译、却改变了载荷形状，
 * 就必须在这里失败。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { Readable } from 'node:stream'
import { Registry } from '../dist/host/registry/service.js'
import { searchProjects, directoryTarget, listDirectory } from '../dist/host/files/service.js'
import { SessionRegistry } from '../dist/host/prompt/sessions.js'
import { createHandlers } from '../dist/host/api/routes.js'
import { createRouteHandler, routePath } from '../dist/host/api/server.js'
import { sectionText, listText, changeNotice, describeUpdate, boundaryText } from '../dist/host/prompt/text.js'
import { basename, absoluteOf, isInside, normalizePath, relativeTo, workspaceKey } from '../dist/host/shared/paths.js'

/** 一个一次性工作区，包含一个带 `src/`、一个文件和 node_modules 的项目。 */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'related-projects-'))
  const ws = join(root, 'ws')
  const other = join(root, 'other-ws')
  const proj = join(root, 'proj')
  for (const dir of [ws, other, proj, join(proj, 'src'), join(proj, 'node_modules')]) mkdirSync(dir)
  writeFileSync(join(proj, 'src', 'index.ts'), 'x')
  writeFileSync(join(proj, 'README.md'), 'x')
  writeFileSync(join(proj, 'node_modules', 'dep.js'), 'x')
  return { root, ws, other, proj, dispose: () => rmSync(root, { recursive: true, force: true }) }
}

const codeOf = (fn) => {
  try {
    fn()
    return 'none'
  } catch (error) {
    return error.code
  }
}

test('registry: adds one project per directory, with defaults and idempotence', () => {
  const box = sandbox()
  try {
    const registry = new Registry(join(box.root, 'store.json'))
    assert.deepEqual(registry.limits, { max: 10, noteMax: 200, nameMax: 60 })

    const added = registry.add(box.ws, { path: box.proj })
    assert.equal(added.name, 'proj')
    assert.equal(added.enabled, true)
    assert.equal(added.origin, 'user')
    assert.equal(added.exists, true)

    assert.equal(registry.add(box.ws, { path: box.proj }).id, added.id, 'the same directory is a no-op')

    const named = registry.add(box.ws, { path: box.root, name: '  spaced  ', note: 'docs', origin: 'agent' })
    assert.equal(named.name, 'spaced', 'names are trimmed')
    assert.equal(named.note, 'docs')
    assert.equal(named.origin, 'agent')
  } finally {
    box.dispose()
  }
})

test('registry: rejects what must never become a related project', () => {
  const box = sandbox()
  try {
    const registry = new Registry(join(box.root, 'store.json'))
    assert.equal(codeOf(() => registry.add(box.ws, { path: join(box.root, 'ghost') })), 'not-directory')
    assert.equal(codeOf(() => registry.add(box.ws, { path: 'relative/dir' })), 'not-directory')
    assert.equal(codeOf(() => registry.add(box.ws, { path: parse(box.root).root })), 'root')
    assert.equal(codeOf(() => registry.add(box.ws, { path: homedir() })), 'home')
    assert.equal(codeOf(() => registry.add(box.ws, { path: box.ws })), 'self')
    assert.equal(codeOf(() => registry.add(join(box.root, 'ghost-ws'), { path: box.proj })), 'workspace-missing')
  } finally {
    box.dispose()
  }
})

test('registry: the snapshot names the requested workspace even before it has rows', () => {
  const box = sandbox()
  try {
    const registry = new Registry(join(box.root, 'store.json'))
    const empty = registry.snapshot(box.ws)
    assert.deepEqual(empty.workspace, { key: workspaceKey(box.ws), path: normalizePath(box.ws) })
    assert.deepEqual(empty.projects, [])
    assert.equal(empty.groups, undefined, 'the cross-workspace lists are not part of a snapshot')
    assert.equal(registry.snapshot('').workspace, null)

    registry.add(box.ws, { path: box.proj })
    assert.equal(registry.snapshot(box.ws).projects.length, 1)
  } finally {
    box.dispose()
  }
})

test('registry: readable splits enabled rows by whether the directory still exists', () => {
  const box = sandbox()
  try {
    const registry = new Registry(join(box.root, 'store.json'))
    const live = registry.add(box.ws, { path: box.proj })
    const gone = registry.add(box.ws, { path: box.other, name: 'gone' })

    registry.update(box.ws, gone.id, { enabled: false })
    assert.equal(registry.readable(box.ws).present.length, 1, 'a disabled row is not offered')

    registry.update(box.ws, gone.id, { enabled: true })
    assert.equal(registry.readable(box.ws).present.length, 2)

    rmSync(box.other, { recursive: true, force: true })
    const split = registry.readable(box.ws)
    assert.deepEqual(split.present.map((row) => row.id), [live.id])
    assert.deepEqual(split.missing.map((row) => row.name), ['gone'])
  } finally {
    box.dispose()
  }
})

test('registry: update, find, remove, copy and persistence', () => {
  const box = sandbox()
  try {
    const file = join(box.root, 'store.json')
    const registry = new Registry(file)
    const added = registry.add(box.ws, { path: box.proj })

    assert.equal(registry.update(box.ws, added.id, { name: 'Renamed' }).name, 'Renamed')
    assert.equal(registry.findProject(box.ws, added.id).name, 'Renamed')
    assert.equal(registry.findProject(box.ws, 'unknown'), undefined)

    assert.deepEqual(registry.copy(box.ws, box.other), { added: 1, skipped: 0 })
    assert.deepEqual(registry.copy(box.ws, box.other), { added: 0, skipped: 1 }, 'an existing path is skipped')
    assert.equal(registry.groups().length, 2)
    assert.equal(codeOf(() => registry.copy('', box.other)), 'no-group')

    assert.equal(registry.remove(box.ws, added.id), 'Renamed', 'remove answers the display name')
    assert.equal(registry.groupFor(box.ws), null, 'an empty group is dropped')
    assert.equal(codeOf(() => registry.remove(box.ws, added.id)), 'no-group')

    assert.equal(registry.setSettings({ alwaysShowDock: false }).alwaysShowDock, false)
    assert.equal(registry.setSettings({ unknown: 1 }).alwaysShowDock, false, 'unknown keys are ignored')

    const reloaded = new Registry(file)
    assert.equal(reloaded.getSettings().alwaysShowDock, false)
    assert.deepEqual(reloaded.snapshot(box.other).projects.map((row) => row.name), ['Renamed'], 'the copy kept the name it was copied with')
  } finally {
    box.dispose()
  }
})

test('registry: an unreadable store is set aside, never overwritten in place', () => {
  const box = sandbox()
  try {
    const file = join(box.root, 'store.json')
    const damaged = '{ "version": 1, "groups": {'
    writeFileSync(file, damaged)

    /* 损坏的文件读成空表，而不是让插件抛错或整个不可用。 */
    const registry = new Registry(file)
    assert.deepEqual(registry.snapshot(box.ws).projects, [])

    registry.add(box.ws, { path: box.proj })

    const backups = readdirSync(box.root).filter((name) => name.startsWith('store.json.broken-'))
    assert.equal(backups.length, 1, 'the damaged bytes are kept beside the file')
    assert.equal(readFileSync(join(box.root, backups[0]), 'utf8'), damaged, 'the backup keeps the original bytes verbatim')
    assert.equal(new Registry(file).snapshot(box.ws).projects.length, 1, 'the rewritten file is valid')
  } finally {
    box.dispose()
  }
})

test('prompt: the section is instructions plus rows, and empty without any project', () => {
  const box = sandbox()
  try {
    const registry = new Registry(join(box.root, 'store.json'))
    registry.add(box.ws, { path: box.proj, note: 'api docs' })
    const gone = registry.add(box.ws, { path: box.other, name: 'gone' })
    rmSync(box.other, { recursive: true, force: true })

    const section = sectionText(registry, box.ws, boundaryText('workspace-write'))
    assert.match(section, /^## Related projects \(1\)/)
    assert.match(section, /Write scope: workspace-write \(writes outside the working directory need approval\)\./)
    assert.match(section, /- proj — .*proj — api docs/)
    assert.match(section, /1 related project is unavailable/)

    const list = listText(registry, box.ws)
    assert.ok(list.startsWith('- proj'), 'the list starts with the rows')
    assert.ok(!list.includes('## Related projects'), 'the list carries no instructions')

    assert.equal(sectionText(registry, join(box.root, 'nobody'), boundaryText(null)), '', 'an unconfigured workspace renders nothing')
    assert.equal(boundaryText(null), 'unknown')
    assert.ok(boundaryText('read-only').startsWith('read-only'))

    assert.match(changeNotice('added x', ''), /ignore every earlier list/)
    assert.match(changeNotice('added x', 'rows'), /supersedes the system prompt/)
    assert.equal(describeUpdate({ name: 'a', note: '', enabled: true }, { name: 'a', note: 'n', enabled: true }), 'note for a is now "n"')
    assert.equal(describeUpdate({ name: 'a', note: '', enabled: true }, { name: 'a', note: '', enabled: false }), 'a disabled')
    assert.equal(describeUpdate({ name: 'a', note: '', enabled: true }, { name: 'a', note: '', enabled: true }), 'updated a')
    assert.equal(gone.id.length > 0, true)
  } finally {
    box.dispose()
  }
})

test('files: ranks by name, hides build directories, and refuses to walk outside', () => {
  const box = sandbox()
  try {
    const roots = [{ path: box.proj, name: 'proj' }]

    const hit = searchProjects(roots, 'index')
    assert.equal(hit.length, 1)
    assert.deepEqual(Object.keys(hit[0]).sort(), ['kind', 'name', 'path', 'rel'], 'a row carries no ranking fields')
    assert.equal(hit[0].rel, 'src/index.ts')

    assert.equal(searchProjects(roots, 'src').length, 1, 'a matching directory swallows its descendants')
    assert.equal(searchProjects(roots, 'dep').length, 0, 'node_modules is not searched')
    assert.equal(searchProjects(roots, '   ').length, 0)

    assert.equal(directoryTarget(roots, join(box.proj, 'src')).rel, 'src')
    assert.equal(directoryTarget(roots, join(box.root, 'elsewhere')), null)
    assert.equal(directoryTarget(roots, join(box.proj, '..', 'other-ws')), null, 'a sibling cannot be reached with ..')

    const level = listDirectory({ path: box.proj, name: 'proj' }, '', '')
    const names = level.rows.map((row) => row.name)
    assert.ok(names.includes('src') && names.includes('README.md'))
    assert.ok(!names.includes('node_modules'))
    assert.equal(level.rows[0].kind, 'directory', 'directories come first')
    assert.equal(level.truncated, false)

    const filtered = listDirectory({ path: box.proj, name: 'proj' }, '', 'read')
    assert.deepEqual(filtered.rows.map((row) => row.name), ['README.md'])
    assert.equal(listDirectory({ path: box.proj, name: 'proj' }, '', '', 1).truncated, true)
    assert.deepEqual(listDirectory({ path: join(box.root, 'missing'), name: 'x' }, '', ''), { rows: [], truncated: false })

    assert.equal(basename('D:\\a\\b\\proj'), 'proj')
    assert.equal(basename('/a/b/proj/'), 'proj')
    assert.equal(normalizePath('relative/dir'), '')
    assert.equal(absoluteOf(box.proj, 'a/b'), join(box.proj, 'a', 'b'))
    assert.ok(isInside(box.proj, join(box.proj, 'src')))
    assert.ok(!isInside(box.proj, box.root))
    assert.equal(relativeTo(box.proj, join(box.proj, 'src', 'x')), 'src/x')
  } finally {
    box.dispose()
  }
})

/* ------------------------------- 路由 ------------------------------- */

function routeFixture() {
  const box = sandbox()
  const registry = new Registry(join(box.root, 'store.json'))
  /* 一个不提供任何可选服务的 Host 上下文：路由必须保持惰性。 */
  const ctx = {
    get: () => undefined,
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    on: () => () => {},
  }
  const sessions = new SessionRegistry(ctx, registry)
  const opened = []
  const handlers = createHandlers({ ctx, registry, sessions, openInFileManager: (path) => opened.push(path) })
  /* Host 为每个方法注册一条 exact 路由；这里照同一张表复现，未命中的路径
     交给「WebServer 的 404」，因此拼错的路径与未知方法一样得到 404。 */
  const routes = new Map(
    Object.entries(handlers).map(([method, handler]) => [routePath(method), createRouteHandler({ ctx, method, handler })]),
  )

  const request = async (method, path, body, headers = {}) => {
    const captured = { status: 0, body: null }
    const serve = routes.get(path)
    if (serve === undefined) {
      captured.status = 404
      captured.body = { ok: false, error: { code: 'not-found', message: 'no such route' } }
      return captured
    }
    const payload = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = Readable.from(payload === '' ? [] : [Buffer.from(payload)])
    req.method = method
    req.url = path
    req.headers = { host: '127.0.0.1:50769', 'content-type': 'application/json', ...headers }
    await serve(req, {
      writeHead: (status) => {
        captured.status = status
      },
      end: (text) => {
        captured.body = JSON.parse(text)
      },
    })
    return captured
  }

  return {
    box,
    registry,
    opened,
    post: (method, body, headers) => request('POST', routePath(method), body, headers),
    request,
    dispose: box.dispose,
  }
}

test('api: the fence, the method table and the error envelope', async () => {
  const fixture = routeFixture()
  try {
    assert.equal((await fixture.request('GET', routePath('state'))).status, 405)
    assert.equal((await fixture.post('state', {}, { origin: 'http://evil.example' })).status, 403)
    assert.equal((await fixture.post('state', {}, { 'sec-fetch-site': 'cross-site' })).status, 403)
    assert.equal((await fixture.post('state', {}, { host: '192.168.1.9:5000' })).status, 403)

    const forbidden = await fixture.post('state', {}, { origin: 'http://evil.example' })
    assert.equal(forbidden.body.error.code, 'forbidden', 'the UI translates by code')

    assert.equal((await fixture.request('POST', routePath('nope'), {})).status, 404)
    assert.equal((await fixture.request('POST', '/related-projects/a/b', {})).status, 404)
    assert.equal((await fixture.request('POST', '/elsewhere/state', {})).status, 404)

    const malformed = await fixture.post('state', '{not json')
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.error.code, 'bad-json')
  } finally {
    fixture.dispose()
  }
})

test('api: state answers one workspace plus the panel lists', async () => {
  const fixture = routeFixture()
  try {
    const empty = await fixture.post('state', {})
    assert.equal(empty.status, 200)
    assert.equal(empty.body.data.workspace, null)
    assert.deepEqual(empty.body.data.projects, [])
    assert.ok(Array.isArray(empty.body.data.workspaces) && Array.isArray(empty.body.data.groups))
    assert.equal(empty.body.data.limits.max, 10)

    assert.equal((await fixture.post('state', { sessionId: 'cold' })).body.data.workspace, null, 'an unresolvable session has no workspace')

    const known = await fixture.post('state', { workspace: fixture.box.ws })
    assert.ok(known.body.data.workspace !== null, 'an explicit workspace is reported before it has rows')
  } finally {
    fixture.dispose()
  }
})

test('api: mutations answer what changed, not a whole snapshot', async () => {
  const fixture = routeFixture()
  try {
    const box = fixture.box
    assert.equal((await fixture.post('add', { path: box.proj })).body.error.code, 'workspace-missing')
    assert.equal((await fixture.post('add', { workspace: box.ws, path: join(box.root, 'ghost') })).status, 400)

    const added = await fixture.post('add', { workspace: box.ws, path: box.proj, note: 'docs', notify: true })
    assert.equal(added.body.data.project.name, 'proj')
    assert.deepEqual(Object.keys(added.body.data), ['project'], 'no full snapshot rides along')
    const id = added.body.data.project.id

    assert.equal((await fixture.post('add', { workspace: box.ws, path: box.proj })).body.data.project.id, id)
    assert.equal((await fixture.post('update', { workspace: box.ws, id, patch: { name: 'P' }, notify: true })).body.data.project.name, 'P')
    assert.equal((await fixture.post('state', { workspace: box.ws })).body.data.projects[0].name, 'P')

    assert.equal((await fixture.post('open', { workspace: box.ws, id })).body.data.opened, true)
    assert.deepEqual(fixture.opened, [box.proj])
    assert.equal((await fixture.post('open', { workspace: box.ws, id: 'unknown' })).status, 400)

    assert.deepEqual((await fixture.post('copy', { from: box.ws, to: box.other })).body.data, { added: 1, skipped: 0 })
    assert.equal((await fixture.post('settings', { alwaysShowDock: false })).body.data.settings.alwaysShowDock, false)

    assert.equal((await fixture.post('remove', { workspace: box.ws, id, notify: true })).body.data.removed, 'P')
    assert.equal((await fixture.post('remove', { workspace: box.ws, id })).status, 400)
    assert.equal((await fixture.post('copy', { from: box.ws, to: box.other })).status, 400, 'the emptied group is gone')
  } finally {
    fixture.dispose()
  }
})

test('api: the @ menu endpoints only walk inside the registered projects', async () => {
  const fixture = routeFixture()
  try {
    const box = fixture.box
    await fixture.post('add', { workspace: box.ws, path: box.proj })

    const found = await fixture.post('files', { workspace: box.ws, query: 'src' })
    assert.equal(found.body.data.rows.length, 1)
    assert.equal(found.body.data.rows[0].kind, 'directory')
    assert.deepEqual((await fixture.post('files', { workspace: box.ws, query: '  ' })).body.data.rows, [])

    const listed = await fixture.post('list', { workspace: box.ws, dir: join(box.proj, 'src'), filter: '' })
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.body.data.rows.map((row) => row.name), ['index.ts'])

    /* 越界有独立的错误码：工作区确实有项目，只是该目录不在任何项目内，
       UI 不能给出相反的说法。 */
    const outside = await fixture.post('list', { workspace: box.ws, dir: box.other, filter: '' })
    assert.equal(outside.status, 400)
    assert.equal(outside.body.error.code, 'outside-project')
    assert.equal((await fixture.post('list', { workspace: box.ws, dir: '', filter: '' })).status, 400)

    const prompt = await fixture.post('prompt', { workspace: box.ws })
    assert.match(prompt.body.data.current, /## Related projects \(1\)/)
    assert.equal(prompt.body.data.attached, false)
    assert.equal(prompt.body.data.liveSessions, 0)
  } finally {
    fixture.dispose()
  }
})
