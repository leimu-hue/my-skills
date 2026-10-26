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

test('a zip can be scanned first, then only the picked skills are imported', async () => {
  const f = await fixture()
  const zip = writeZip([
    { name: 'alpha-skill/SKILL.md', data: Buffer.from('---\nname: alpha-skill\ndescription: a\n---\na\n') },
    { name: 'alpha-skill/references/x.md', data: Buffer.from('x\n') },
    { name: 'beta-skill/SKILL.md', data: Buffer.from('---\nname: beta-skill\ndescription: b\n---\nb\n') },
    { name: 'flat-one.md', data: Buffer.from('---\nname: flat-one\ndescription: f\n---\n') },
    { name: 'Bad_Name/SKILL.md', data: Buffer.from('---\nname: x\ndescription: y\n---\n') },
  ])
  const base64 = zip.toString('base64')

  // 先扫：只读，什么都不落盘。
  const scan = await f.service.scanImport('import', base64)
  assert.equal(scan.ok, true)
  assert.deepEqual(scan.data.candidates.map((entry) => entry.name).sort(), ['alpha-skill', 'beta-skill', 'flat-one'])
  assert.equal(scan.data.candidates.every((entry) => entry.exists === false), true)
  assert.equal(scan.data.candidates.find((entry) => entry.name === 'alpha-skill').files, 2)
  assert.equal(scan.data.candidates.find((entry) => entry.name === 'flat-one').flat, true)
  // 名字不合法的要如实报出来，不能静默丢。
  assert.equal(scan.data.rejected.some((entry) => entry.name === 'Bad_Name'), true)
  assert.equal(await stat(join(f.dshHome, 'tool-center', 'skills', 'alpha-skill')).then(() => true).catch(() => false), false, 'scan must not write')

  // 再导：只导入勾选的两条。
  const imported = await f.service.importZip('import', base64, undefined, ['alpha-skill', 'flat-one'])
  assert.equal(imported.ok, true)
  assert.deepEqual(imported.data.imported.map((entry) => entry.name).sort(), ['alpha-skill', 'flat-one'])
  assert.equal(await readFile(join(f.dshHome, 'tool-center', 'skills', 'alpha-skill', 'references', 'x.md'), 'utf8'), 'x\n')
  assert.equal(await readFile(join(f.dshHome, 'tool-center', 'skills', 'flat-one.md'), 'utf8').then((text) => text.includes('flat-one')), true)
  // 没勾选的不能出现。
  await assert.rejects(() => readFile(join(f.dshHome, 'tool-center', 'skills', 'beta-skill', 'SKILL.md'), 'utf8'))

  // 同一份包再扫一次：已存在的那条要标出来。
  const again = await f.service.scanImport('import', base64)
  assert.equal(again.data.candidates.find((entry) => entry.name === 'alpha-skill').exists, true)
  assert.equal(again.data.candidates.find((entry) => entry.name === 'beta-skill').exists, false)
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
  assert.equal(off.rank, 1, 'a fixed bottom rank, so it outranks every host provider rank')

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

test('sources the host publishes but we do not scan are discovered from the registry, not guessed', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-host-'))
  const dshHome = join(base, 'dsh')
  const pack = join(base, 'tool-management', 'official-skills', 'desktop')
  await mkdir(join(pack, 'shipped-one'), { recursive: true })
  await writeFile(join(pack, 'shipped-one', 'SKILL.md'), '---\nname: shipped-one\ndescription: d\n---\nbody\n')

  const options = (hostCandidates) => ({
    dshHome,
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates,
  })

  // 没有注册表 → 不猜任何目录。
  assert.equal((await createService(options(undefined)).view()).roots.some((r) => r.kind === 'host'), false)

  // 注册表里出现一个我们没有来源的目录 → 它变成一个只读来源，里面的技能也被扫出来。
  const withPack = await createService(options(async () => [
    { name: 'shipped-one', docPath: join(pack, 'shipped-one', 'SKILL.md') },
  ])).view()
  const discovered = withPack.roots.find((root) => root.kind === 'host')
  assert.ok(discovered !== undefined, 'a host-published directory becomes its own source')
  assert.deepEqual(discovered.skills.map((row) => row.declaredName), ['shipped-one'])
  assert.equal(discovered.hostScans, true, 'the host already publishes it: we only overlay on policy change')
  assert.equal(discovered.writable, false)

  // 已经是我们已知来源的目录不会被重复列出（这里模拟宿主报告 $DSH_HOME/skills 里的技能）。
  await mkdir(join(dshHome, 'skills'), { recursive: true })
  const localSvc = createService(options(async () => [
    { name: 'local-one', docPath: join(dshHome, 'skills', 'local-one', 'SKILL.md') },
  ]))
  const localView = await localSvc.view()
  assert.equal(localView.roots.some((root) => root.kind === 'host'), false, 'our own roots are not re-listed')

  // 平铺技能（<root>/<name>.md）也能反推出正确来源。
  const flatView = await createService(options(async () => [
    { name: 'flat-one', docPath: join(pack, 'flat-one.md') },
  ])).view()
  assert.equal(flatView.roots.find((root) => root.kind === 'host')?.path, pack)
})

test('a warm host-dir cache keeps panel reads off the registry; a change is picked up on refresh', async () => {
  const base = await mkdtemp(join(tmpdir(), 'sm-cache-'))
  const packA = join(base, 'official-a')
  const packB = join(base, 'official-b')
  for (const [pack, name] of [[packA, 'one'], [packB, 'two']]) {
    await mkdir(join(pack, name), { recursive: true })
    await writeFile(join(pack, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody\n`)
  }
  let candidates = [{ name: 'one', skillDir: join(packA, 'one') }]
  let calls = 0
  const service = createService({
    dshHome: join(base, 'dsh'),
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: async () => {
      calls += 1
      return candidates
    },
  })

  const first = await service.view()
  assert.equal(calls, 1)
  assert.equal(first.roots.find((root) => root.kind === 'host')?.path, packA)

  // 第二次读取（用户每次进技能页都会读一次）：直接命中缓存，不再跑宿主 list()。
  await service.view()
  assert.equal(calls, 1, 'a panel read with a warm cache must not call skills.list()')

  // 宿主注册表变了：事件路径重探一次，下一次读取看到新来源。
  candidates = [...candidates, { name: 'two', skillDir: join(packB, 'two') }]
  await service.refreshHostDirs()
  assert.equal(calls, 2)
  const after = await service.view()
  assert.equal(calls, 2, 'the warm cache is reused after the refresh')
  assert.equal(after.roots.find((root) => root.path === packB)?.key.startsWith('host-'), true)
})

test('the real host summary only carries resourceBase: a bundle still points at its parent source', async () => {
  // ctx.skills.list() 返回的是 toSummary()：没有 path / locator，只剩 resourceBase.path。
  // bundle 的 resourceBase 是 <root>/<skill>，所以父目录才是来源。
  const base = await mkdtemp(join(tmpdir(), 'sm-summary-'))
  const pack = join(base, 'official-skills')
  await mkdir(join(pack, 'shipped-one'), { recursive: true })
  await writeFile(join(pack, 'shipped-one', 'SKILL.md'), '---\nname: shipped-one\ndescription: d\n---\nbody\n')

  const view = await createService({
    dshHome: join(base, 'dsh'),
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: async () => [
      { name: 'shipped-one', skillDir: join(pack, 'shipped-one') },
    ],
  }).view()
  assert.equal(view.roots.find((root) => root.kind === 'host')?.path, pack)
})

test('a flat skill resourceBase is not a bundle: its parent must not become a source', async () => {
  // 平铺技能的 resourceBase 就是来源目录本身（目录里没有 SKILL.md）。
  // 若按「往上两级」处理，~/.claude/skills 这类来源会被误推成 ~/.claude 并整目录扫描。
  const base = await mkdtemp(join(tmpdir(), 'sm-flat-'))
  const flatRoot = join(base, 'shared-skills')
  await mkdir(flatRoot, { recursive: true })
  await writeFile(join(flatRoot, 'one.md'), '---\nname: one\ndescription: d\n---\nbody\n')

  const view = await createService({
    dshHome: join(base, 'dsh'),
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: async () => [{ name: 'one', skillDir: flatRoot }],
  }).view()
  assert.equal(view.roots.some((root) => root.kind === 'host'), false)
  assert.equal(view.roots.some((root) => root.path === base), false, 'the parent of a flat root must never be guessed')
})

test('a skill unpacked into the system temp dir must not turn %TEMP% into a source', async () => {
  // 真实案例：Windows ACL 诊断技能把资源解包到 %TEMP%\dsh-acl-skill-*，宿主以
  // resourceBase=<那个目录> 发布它；反推出来的「来源」就是 %TEMP% 本身。
  // 面板因此把整个 Temp（上千个目录 / 一堆无关 .md）扫成技能列表。
  const base = await mkdtemp(join(tmpdir(), 'sm-acl-'))
  const unpacked = await mkdtemp(join(tmpdir(), 'dsh-acl-skill-'))
  await writeFile(join(unpacked, 'SKILL.md'), '---\nname: acl-skill\ndescription: d\n---\nbody\n')
  // Temp 里的无关内容：一旦 Temp 成了来源，它们会以「结构不完整」的技能出现。
  await mkdir(join(base, 'notes'), { recursive: true })
  await writeFile(join(base, 'notes', 'todo.md'), 'not a skill\n')

  // 两种候选形状都试：真实摘要给的 resourceBase，以及（更乐观的）文档路径。
  const view = await createService({
    dshHome: join(base, 'dsh'),
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: async () => [
      { name: 'acl-skill', skillDir: unpacked },
      { name: 'acl-skill-doc', docPath: join(unpacked, 'SKILL.md') },
    ],
  }).view()
  assert.equal(view.roots.some((root) => root.kind === 'host'), false, 'the temp dir is a container, not a skill source')
})

test('overlay candidates outrank every host provider rank (project 100 … bundled 600)', async () => {
  const f = await fixture()
  // 宿主的 rank 不止 400 一档：project 100/200、runtime 250、custom 300、user 400、
  // agents 500、bundled 600。覆盖候选必须比**所有**档位都小，否则遇到 custom（300）
  // 这类来源（office 就在那里）就会被宿主压住，停了还能在 `/` 里搜到。
  await f.service.setSkill('codex', 'codex-only', false)
  await f.service.setSkill('claude', 'deep', false)
  const candidates = await f.service.makeProvider().list({})
  const off = candidates.filter((entry) => !entry.invocation.modelInvocable)
  assert.ok(off.length >= 2, 'every switched-off skill must be published')
  for (const candidate of off) {
    assert.ok(candidate.rank < 100, `${candidate.name} must outrank every host provider (rank ${candidate.rank})`)
  }
})

test('a disabled skill in a host-scanned source still outranks the host custom tier (300)', async () => {
  // office 这类技能由宿主自己的 provider 从 custom 目录（rank 300）发布。覆盖候选若按
  // 「组内最优 − 1」算成 399，就会输给 300 —— 面板里关了，`/` 里照样能搜到。
  const base = await mkdtemp(join(tmpdir(), 'sm-host-overlay-'))
  const pack = join(base, 'official-skills')
  await mkdir(join(pack, 'office'), { recursive: true })
  await writeFile(join(pack, 'office', 'SKILL.md'), '---\nname: office\ndescription: docs\n---\nbody\n')
  const service = createService({
    dshHome: join(base, 'dsh'),
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: async () => [{ name: 'office', skillDir: join(pack, 'office') }],
  })

  const view = await service.view()
  const root = view.roots.find((entry) => entry.kind === 'host')
  assert.equal(root.skills[0].declaredName, 'office')
  await service.setSkill(root.key, 'office', false)

  const candidate = (await service.makeProvider().list({})).find((entry) => entry.name === 'office')
  assert.ok(candidate !== undefined, 'the disabled host skill must be overlaid')
  assert.equal(candidate.invocation.modelInvocable, false)
  assert.equal(candidate.rank, 1, 'must outrank the host custom tier (300), not just the user tier (400)')
})

test('reading host dirs does not recurse back into our own provider', async () => {
  // 真实宿主里 skills.list() 会把每个 provider 都问一遍 —— 包括本插件注册的那个，
  // 而 provider.list() 自己也要读视图。早先视图在读视图里再问 skills.list()，
  // 于是「面板 → 宿主 → 面板」无限递归，面板永远停在「正在加载技能…」。
  const base = await mkdtemp(join(tmpdir(), 'sm-reentrant-'))
  const dshHome = join(base, 'dsh')
  const pack = join(base, 'official-skills')
  await mkdir(join(dshHome, 'skills', 'alpha-skill'), { recursive: true })
  await writeFile(join(dshHome, 'skills', 'alpha-skill', 'SKILL.md'), '---\nname: alpha-skill\ndescription: a\n---\nbody\n')
  await mkdir(join(pack, 'shipped-one'), { recursive: true })
  await writeFile(join(pack, 'shipped-one', 'SKILL.md'), '---\nname: shipped-one\ndescription: s\n---\nbody\n')

  let calls = 0
  let service
  const registry = {
    async list(options = {}) {
      calls += 1
      // 递归一旦发生就会一直涨；这里早点炸掉，让失败的测试给出清晰原因。
      if (calls > 5) throw new Error('host registry re-entered: reading the view must not call skills.list() again')
      // 宿主自己发布的候选（这里模拟官方技能包）+ 本插件 provider 的候选，正是真实宿主的合成方式。
      return [
        { name: 'shipped-one', docPath: join(pack, 'shipped-one', 'SKILL.md') },
        ...(await service.makeProvider().list(options)),
      ]
    },
  }
  service = createService({
    dshHome,
    agentsHome: join(base, 'agents'),
    claudeHome: join(base, 'claude'),
    codexHome: join(base, 'codex'),
    hostCandidates: () => registry.list({}),
  })

  const view = await service.view()
  assert.equal(calls, 1, 'one panel read asks the registry exactly once')
  const discovered = view.roots.find((root) => root.kind === 'host')
  assert.equal(discovered?.path, pack, 'the host-published directory is still discovered')

  // provider 自己绝不探测注册表：它就是被注册表回调的那一方。
  const before = calls
  await service.makeProvider().list({})
  assert.equal(calls, before, 'the provider only reads the cached host dirs')
})

test('the provider never publishes a candidate the host would reject', async () => {
  // 宿主在 skills.list() 的 provider 返回值上硬校验，而且校验在 try/catch 之外：
  // 一条不合规的候选会让整次 list() 抛错 —— 用户看到的是「本轮运行失败」。
  const f = await fixture()
  // 两条都放在 codex（hostScans=false，本来「每条都要发覆盖候选」）。
  const chinese = join(f.codexHome, 'skills', '需求开发归档')
  await mkdir(chinese, { recursive: true })
  await writeFile(join(chinese, 'SKILL.md'), '---\nname: 需求开发归档\ndescription: 中文名\n---\nbody\n')
  const noDescription = join(f.codexHome, 'skills', 'no-description')
  await mkdir(noDescription, { recursive: true })
  await writeFile(join(noDescription, 'SKILL.md'), '---\nname: no-description\n---\nbody\n')

  const view = await f.service.view()
  const codex = view.roots.find((root) => root.key === 'codex')
  const invalidName = codex.skills.find((row) => row.name === '需求开发归档')
  assert.equal(invalidName.loadable, false, 'a name the host cannot accept is not a loadable skill')
  assert.match(invalidName.problem ?? '', /invalid name/)
  const missingDescription = codex.skills.find((row) => row.name === 'no-description')
  assert.equal(missingDescription.loadable, false)
  assert.match(missingDescription.problem ?? '', /missing description/)

  const candidates = await f.service.makeProvider().list({})
  for (const candidate of candidates) {
    assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `invalid candidate name: ${candidate.name}`)
    assert.notEqual(candidate.description.trim(), '', `candidate ${candidate.name} has no description`)
  }
  assert.equal(candidates.some((candidate) => candidate.name === '需求开发归档'), false)
  assert.equal(candidates.some((candidate) => candidate.name === 'no-description'), false)

  // 列表之后磁盘被改坏：get() 也不能把空描述交上去（宿主的 validateDefinition 会抛错）。
  const codexOnly = candidates.find((candidate) => candidate.name === 'codex-only')
  assert.ok(codexOnly !== undefined)
  await writeFile(join(f.codexHome, 'skills', 'codex-only', 'SKILL.md'), '---\nname: codex-only\ndescription: ""\n---\nbody\n')
  assert.equal(await f.service.makeProvider().get(codexOnly), undefined, 'a skill that lost its description must report gone')
})
test('restoring a skill snapshot goes through the lock and invalidates once', async () => {
  const f = await fixture()
  let invalidated = 0
  f.service.invalidators.add(() => { invalidated += 1 })

  // 场景回滚用：同一个条目重复出现时，只有第一次算变更。
  const off = await f.service.restoreSkills([
    { root: 'local', name: 'local-one', enabled: false },
    { root: 'local', name: 'local-one', enabled: false },
  ])
  assert.equal(off.ok, true)
  assert.equal(off.data.updated, 1, 'a repeated entry is a no-op')
  assert.equal(invalidated, 1, 'one write, one invalidation')
  assert.equal((await rowOfService(f.service, 'local', 'local-one')).policy.skillOn, false)

  const on = await f.service.restoreSkills([{ root: 'local', name: 'local-one', enabled: true }])
  assert.equal(on.data.updated, 1)
  assert.equal((await rowOfService(f.service, 'local', 'local-one')).policy.skillOn, true)
})