import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/host/skills/service.js'
import { readZip, writeZip } from '../dist/host/shared/zip.js'

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'sm-svc-'))
  const dshHome = join(base, 'dsh')
  const agentsHome = join(base, 'agents')
  const claudeHome = join(base, 'claude')
  const codexHome = join(base, 'codex')
  const events = []

  const skill = async (root, name, description, extra = '') => {
    const dir = join(root, name)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\nBody of ${name}\n`)
  }

  await skill(join(dshHome, 'skills'), 'local-one', 'from the dsh root')
  await skill(join(dshHome, 'skills'), 'dup', 'local copy of a duplicate')
  await skill(join(codexHome, 'skills'), 'dup', 'codex copy of a duplicate')
  await skill(join(codexHome, 'skills'), 'codex-only', 'only in codex')
  await skill(join(agentsHome, 'skills'), 'agents-one', 'from the agents root')
  // claude 来源里放一条平铺技能和一个嵌套 bundle。
  await mkdir(join(claudeHome, 'skills'), { recursive: true })
  await writeFile(join(claudeHome, 'skills', 'flat-one.md'), '---\nname: flat-one\ndescription: flat file skill\n---\nflat body\n')
  await skill(join(claudeHome, 'skills', 'nested'), 'deep', 'nested under a category dir')

  const service = createService({
    dshHome,
    agentsHome,
    claudeHome,
    codexHome,
    log: (event, detail) => events.push({ event, detail }),
  })
  return { base, dshHome, agentsHome, claudeHome, codexHome, service, events }
}

const rowOfService = async (service, rootKey, name) => {
  const view = await service.view()
  const root = view.roots.find((candidate) => candidate.key === rootKey)
  return root?.skills.find((row) => row.name === name || row.declaredName === name)
}

test('view lists every root, parses frontmatter and flags nested entries', async () => {
  const f = await fixture()
  const view = await f.service.view()
  const keys = view.roots.map((root) => root.key).sort()
  assert.deepEqual(keys, ['agents', 'claude', 'codex', 'import', 'local'])

  const local = view.roots.find((root) => root.key === 'local')
  assert.equal(local.hostScans, true)
  assert.equal(local.writable, true)
  assert.deepEqual(local.skills.map((row) => row.declaredName).sort(), ['dup', 'local-one'])

  const claude = view.roots.find((root) => root.key === 'claude')
  assert.equal(claude.hostScans, false)
  const nested = claude.skills.find((row) => row.name === 'deep')
  assert.ok(nested !== undefined, 'a bundle one level down is discovered')
  assert.equal(nested.nested, true)
  const flat = claude.skills.find((row) => row.name === 'flat-one')
  assert.equal(flat.form, 'flat')
  assert.equal(flat.nested, false)
})

test('the same declared name marks one winner and one shadowed copy', async () => {
  const f = await fixture()
  const view = await f.service.view()
  const dupRows = view.roots.flatMap((root) => root.skills).filter((row) => row.declaredName === 'dup')
  assert.equal(dupRows.length, 2)
  const winner = dupRows.find((row) => !row.shadowed)
  assert.equal(winner.rootKey, 'local', 'the lower rank wins')
  assert.equal(dupRows.find((row) => row.shadowed).rootKey, 'codex')
})

test('reading state never writes the state file (the loop bug cannot come back)', async () => {
  const f = await fixture()
  const statePath = join(f.dshHome, 'tool-center', 'state.json')
  // 第一次写盘只由一次变更触发。
  const change = await f.service.setSkill('local', 'local-one', false)
  assert.equal(change.ok, true)
  const before = await stat(statePath)
  const contentBefore = await readFile(statePath, 'utf8')

  for (let round = 0; round < 5; round += 1) await f.service.view()
  await f.service.view(undefined, 'some-session')

  const after = await stat(statePath)
  const contentAfter = await readFile(statePath, 'utf8')
  assert.equal(contentAfter, contentBefore, 'reads must not rewrite policy')
  assert.equal(after.mtimeMs, before.mtimeMs, 'reads must not touch the file')
  assert.equal(f.events.filter((event) => event.event === 'policy-enable').length, 0)
})

test('a repeated switch is a no-op: no write, no log line', async () => {
  const f = await fixture()
  const statePath = join(f.dshHome, 'tool-center', 'state.json')

  const first = await f.service.setSkill('local', 'local-one', false)
  assert.equal(first.data.changed, true)
  const afterFirst = await stat(statePath)
  const eventCount = f.events.length

  const second = await f.service.setSkill('local', 'local-one', false)
  assert.equal(second.ok, true)
  assert.equal(second.data.changed, false, 'already off: nothing to do')
  const afterSecond = await stat(statePath)
  assert.equal(afterSecond.mtimeMs, afterFirst.mtimeMs, 'no rewrite')
  assert.equal(f.events.length, eventCount, 'no log line for a no-op')

  const back = await f.service.setSkill('local', 'local-one', true)
  assert.equal(back.data.changed, true)
  const row = await rowOfService(f.service, 'local', 'local-one')
  assert.equal(row.policy.modelInvocable, true)
})

test('a root switch turns its skills off, and a project root refuses instead of pretending', async () => {
  const f = await fixture()
  const off = await f.service.setSource('codex', false)
  assert.equal(off.ok, true)
  const codexRow = await rowOfService(f.service, 'codex', 'codex-only')
  assert.equal(codexRow.policy.rootOn, false)
  assert.equal(codexRow.policy.modelInvocable, false)

  // 项目来源由 cwd 推导，永远不是被开关切出来的。
  const projectRoot = join(f.base, 'project')
  await mkdir(join(projectRoot, '.git'), { recursive: true })
  await mkdir(join(projectRoot, '.dsh', 'skills', 'proj-skill'), { recursive: true })
  await writeFile(join(projectRoot, '.dsh', 'skills', 'proj-skill', 'SKILL.md'), '---\nname: proj-skill\ndescription: p\n---\nbody\n')
  const view = await f.service.view(projectRoot)
  const project = view.roots.find((root) => root.kind === 'project-dsh')
  assert.ok(project !== undefined, 'the project root is listed for that cwd')
  const refused = await f.service.setSource(project.key, false, undefined, projectRoot)
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'error.source.project')
})

test('prefer moves the winner of a same-name conflict', async () => {
  const f = await fixture()
  const pinned = await f.service.prefer('codex', 'dup', true)
  assert.equal(pinned.ok, true)
  const view = await f.service.view()
  const dupRows = view.roots.flatMap((root) => root.skills).filter((row) => row.declaredName === 'dup')
  assert.equal(dupRows.find((row) => !row.shadowed).rootKey, 'codex')
  assert.equal(dupRows.find((row) => row.rootKey === 'codex').preferred, true)

  await f.service.prefer('codex', 'dup', false)
  const after = await f.service.view()
  const rows = after.roots.flatMap((root) => root.skills).filter((row) => row.declaredName === 'dup')
  assert.equal(rows.find((row) => !row.shadowed).rootKey, 'local')
})

test('create / update / delete / restore round-trip, and delete cleans the policy', async () => {
  const f = await fixture()
  const created = await f.service.create('local', { name: 'brand-new', description: 'made by the test', body: '# Hi\n' })
  assert.equal(created.ok, true)
  const docPath = join(f.dshHome, 'skills', 'brand-new', 'SKILL.md')
  const text = await readFile(docPath, 'utf8')
  assert.match(text, /name: brand-new/)
  assert.match(text, /description: made by the test/)

  // 未知的 frontmatter 键要能扛过一次编辑。
  await writeFile(docPath, '---\nname: brand-new\ndescription: made by the test\nlicense: MIT\n---\n\n# Hi\n')
  const updated = await f.service.update('local', 'brand-new', { description: 'edited', body: '# Bye\n' })
  assert.equal(updated.ok, true)
  const afterUpdate = await readFile(docPath, 'utf8')
  assert.match(afterUpdate, /license: MIT/)
  assert.match(afterUpdate, /description: edited/)
  assert.match(afterUpdate, /# Bye/)

  // 先停用再删除：策略表里不能留下这个死名字。
  await f.service.setSkill('local', 'brand-new', false)
  const removed = await f.service.remove('local', 'brand-new')
  assert.equal(removed.ok, true)
  assert.equal(removed.data.id.length > 0, true)
  const state = JSON.parse(await readFile(join(f.dshHome, 'tool-center', 'state.json'), 'utf8'))
  assert.deepEqual(state.hiddenSkills.local ?? [], [], 'the deleted name is gone from the policy')

  const trash = await f.service.trashList()
  assert.equal(trash.data.items.length, 1)
  const restored = await f.service.trashRestore(trash.data.items[0].id)
  assert.equal(restored.ok, true)
  const back = await readFile(docPath, 'utf8')
  assert.match(back, /brand-new/)
  await assert.rejects(() => readFile(join(f.dshHome, 'tool-center', 'trash', trash.data.items[0].id, 'metadata.json'), 'utf8'))
})

test('refuses to write outside the skill root, and refuses invalid names', async () => {
  const f = await fixture()
  const escape = await f.service.create('local', { name: '../escape', description: 'x' })
  assert.equal(escape.ok, false)
  assert.equal(escape.code, 'error.name.invalid')

  const readonly = await f.service.create('agents', { name: 'nope', description: 'x' })
  assert.equal(readonly.ok, false)
  assert.equal(readonly.code, 'error.root.readonly')

  const duplicate = await f.service.create('local', { name: 'local-one', description: 'x' })
  assert.equal(duplicate.ok, false)
  assert.equal(duplicate.code, 'error.skill.exists')
})

test('import from a zip and export back to a zip', async () => {
  const f = await fixture()
  const zip = writeZip([
    { name: 'shipped/SKILL.md', data: Buffer.from('---\nname: shipped\ndescription: came from a zip\n---\nzip body\n') },
    { name: 'shipped/references/notes.md', data: Buffer.from('notes\n') },
  ])
  const imported = await f.service.importZip('import', zip.toString('base64'))
  assert.equal(imported.ok, true)
  assert.deepEqual(imported.data.imported.map((item) => item.name), ['shipped'])
  const body = await readFile(join(f.dshHome, 'tool-center', 'skills', 'shipped', 'references', 'notes.md'), 'utf8')
  assert.equal(body, 'notes\n')

  const exported = await f.service.exportZip([{ root: 'import', name: 'shipped' }])
  assert.equal(exported.ok, true)
  const files = readZip(Buffer.from(exported.data.base64, 'base64'))
  const names = files.map((file) => file.name).sort()
  assert.deepEqual(names, ['shipped/SKILL.md', 'shipped/references/notes.md'])
})

test('import refuses a zip whose entry escapes the directory', async () => {
  const f = await fixture()
  const zip = writeZip([{ name: '../evil/SKILL.md', data: Buffer.from('---\nname: evil\ndescription: e\n---\n') }])
  const result = await f.service.importZip('import', zip.toString('base64'))
  assert.equal(result.ok, false)
})

test('a corrupt state file degrades instead of switching everything off', async () => {
  const f = await fixture()
  await mkdir(join(f.dshHome, 'tool-center'), { recursive: true })
  await writeFile(join(f.dshHome, 'tool-center', 'state.json'), '{ broken')
  const view = await f.service.view()
  assert.equal(view.stateHealthy, false)
  assert.ok(view.warnings.some((warning) => warning.includes('状态文件')))
  // 技能仍然列得出来、仍然可用；写操作也照常能用。
  const local = view.roots.find((root) => root.key === 'local')
  assert.equal(local.skills.length > 0, true)
  const changed = await f.service.setSkill('local', 'local-one', false)
  assert.equal(changed.ok, true)
  assert.equal(changed.data.changed, true)
})

test('custom roots can be added and removed', async () => {
  const f = await fixture()
  const extra = join(f.base, 'extra-skills')
  await mkdir(join(extra, 'custom-one'), { recursive: true })
  await writeFile(join(extra, 'custom-one', 'SKILL.md'), '---\nname: custom-one\ndescription: custom\n---\nbody\n')

  const added = await f.service.addRoot(extra)
  assert.equal(added.ok, true)
  const view = await f.service.view()
  const custom = view.roots.find((root) => root.key === added.data.key)
  assert.ok(custom !== undefined)
  assert.equal(custom.hostScans, false)
  assert.deepEqual(custom.skills.map((row) => row.declaredName), ['custom-one'])

  // 重复添加同一个目录是空操作；添加一个重叠目录会被拒绝。
  const again = await f.service.addRoot(extra)
  assert.equal(again.data.changed, false)
  const overlap = await f.service.addRoot(join(extra, 'custom-one'))
  assert.equal(overlap.ok, false)
  assert.equal(overlap.code, 'error.root.overlap')

  const removed = await f.service.removeRoot(added.data.key)
  assert.equal(removed.ok, true)
  const after = await f.service.view()
  assert.equal(after.roots.some((root) => root.key === added.data.key), false)
})

test('the provider only publishes what it must', async () => {
  const f = await fixture()
  const provider = f.service.makeProvider()
  // 什么都没关：local/agents 由宿主自己供给，所以只发布它看不见的来源（codex、claude），
  // 外加 claude 里那条嵌套的。dup 被本地副本遮蔽，于是根本不会有候选。
  const initial = await provider.list({})
  const names = initial.map((candidate) => candidate.name).sort()
  assert.deepEqual(names, ['codex-only', 'deep', 'flat-one'])

  // 关掉一条宿主已扫描的技能，恰好为它多出一个候选。
  await f.service.setSkill('local', 'local-one', false)
  const after = await provider.list({})
  const off = after.find((candidate) => candidate.name === 'local-one')
  assert.ok(off !== undefined, 'the switched-off skill now has an overlay')
  assert.equal(off.invocation.modelInvocable, false)
  assert.equal(off.rank, 399, 'one below the group rank, so it wins the name')

  // get() 能为已发布的候选取回正文。
  const loaded = await provider.get(after.find((candidate) => candidate.name === 'codex-only'))
  assert.match(loaded.content, /Body of codex-only/)
})

test('pinning a higher-ranked root still wins the name (rank is per group)', async () => {
  const f = await fixture()
  // dup 在 local（rank 400）与 codex（rank 520）各一份。钉住 codex 意味着我们的候选
  // 必须压过宿主为本地副本发的、rank 400 的那一条。
  await f.service.prefer('codex', 'dup', true)
  const provider = f.service.makeProvider()
  const candidates = await provider.list({})
  const pinned = candidates.find((candidate) => candidate.name === 'dup')
  assert.ok(pinned !== undefined, 'the pinned copy must be published')
  assert.equal(pinned.locator.rootKey, 'codex')
  assert.ok(pinned.rank < 400, `pinned rank ${pinned.rank} must be below the competing root rank 400`)
  assert.equal(pinned.invocation.modelInvocable, true)
})

test('a write invalidates the provider so the host re-lists', async () => {
  const f = await fixture()
  let invalidated = 0
  f.service.invalidators.add(() => { invalidated += 1 })
  await f.service.setSkill('local', 'local-one', false)
  assert.equal(invalidated, 1)
  // 空操作开关也不该吵醒宿主。
  await f.service.setSkill('local', 'local-one', false)
  assert.equal(invalidated, 1)
})

test('deleting a flat skill moves only that file, never the whole root', async () => {
  const f = await fixture()
  // 平铺技能：<root>/<name>.md，entryPath 会是整个来源根。
  await writeFile(join(f.dshHome, 'skills', 'flat-skill.md'), '---\nname: flat-skill\ndescription: flat one\n---\nbody\n')

  const before = await f.service.view()
  const local = before.roots.find((root) => root.key === 'local')
  assert.equal(local.skills.length, 3, 'local root holds two bundles + one flat skill')

  const removed = await f.service.remove('local', 'flat-skill')
  assert.equal(removed.ok, true)
  assert.equal(removed.data.form, 'flat')

  // 根目录必须还在，其他技能一个都不能少。
  const after = await f.service.view()
  const localAfter = after.roots.find((root) => root.key === 'local')
  assert.deepEqual(localAfter.skills.map((row) => row.name).sort(), ['dup', 'local-one'], 'the other skills survive')
  const flatStillThere = await stat(join(f.dshHome, 'skills', 'flat-skill.md')).then(() => true).catch(() => false)
  assert.equal(flatStillThere, false, 'the flat file itself is gone from the root')

  // 恢复把它放回原位。
  const trash = await f.service.trashList()
  const item = trash.data.items.find((candidate) => candidate.name === 'flat-skill')
  assert.ok(item !== undefined)
  assert.equal(item.originalPath, join(f.dshHome, 'skills', 'flat-skill.md'), 'the trash records the file, not the directory')
  const restored = await f.service.trashRestore(item.id)
  assert.equal(restored.ok, true)
  const back = await readFile(join(f.dshHome, 'skills', 'flat-skill.md'), 'utf8')
  assert.match(back, /flat-skill/)
})
