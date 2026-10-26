import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 四个域视图现在各自是一个模块，各有自己的 import 图。这个测试把它们单独打成一个 ESM
 * bundle，然后用一个假 React 各渲染一次：空状态下的渲染错误（坏 import、hook 顺序、
 * 对 undefined 取字段）在这里就暴露，而不是等用户点开那个页签。
 *
 * 为什么在测试里现打一次而不是复用 `dist/client.js`：那个 bundle 只暴露 ModuleLoader
 * 入口，拿不到单个视图；而「每个视图能独立渲染」正是模块化的意义。
 */
async function loadViews() {
  const esbuild = await import('esbuild')
  const work = await mkdtemp(join(tmpdir(), 'tc-views-'))
  const entry = join(root, 'test', '.views-entry.ts')
  await writeFile(entry, [
    "export { setReact } from '../src/client/core/runtime.js'",
    "export { SkillsView } from '../src/client/skills/view.js'",
    "export { PromptsView } from '../src/client/prompts/view.js'",
    "export { McpView } from '../src/client/mcp/view.js'",
    "export { ScenesView } from '../src/client/scenes/view.js'",
    "export { renderDetail } from '../src/client/skills/detail.js'",
    "export { renderRoot } from '../src/client/skills/list.js'",
    "export { renderImport } from '../src/client/skills/import.js'",
    "export { renderForm } from '../src/client/skills/form.js'",
    '',
  ].join('\n'))
  const outfile = join(work, 'views.mjs')
  try {
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      logLevel: 'silent',
    })
    return await import(pathToFileURL(outfile).href)
  } finally {
    await rm(entry, { force: true })
    await rm(work, { recursive: true, force: true })
  }
}

/** 一次渲染够用：state 保持初值，effect 不跑，setState 是空操作。 */
function fakeReact() {
  let created = 0
  return {
    get created() {
      return created
    },
    createElement(type, props, ...children) {
      created += 1
      return { type, props: props ?? {}, children }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useMemo(factory) {
      return factory()
    },
    useCallback(fn) {
      return fn
    },
    useRef(value) {
      return { current: value }
    },
    Fragment: 'Fragment',
  }
}

test('every domain view renders once on an empty payload', async () => {
  const views = await loadViews()
  const React = fakeReact()
  views.setReact(React)
  const t = (key) => key

  const cases = [
    ['skills', views.SkillsView],
    ['prompts', views.PromptsView],
    ['mcp', views.McpView],
    ['scenes', views.ScenesView],
  ]
  for (const [name, View] of cases) {
    const tree = View({ t, notify: () => {} })
    assert.ok(tree !== null && typeof tree === 'object', `${name} view must return an element`)
  }
  assert.ok(React.created > 0, 'the views must actually create elements')
})

test('the detail drawer sits in a mask, and only the mask closes it', async () => {
  const views = await loadViews()
  views.setReact(fakeReact())
  const t = (key) => key
  let closed = 0
  const row = {
    rootKey: 'local',
    rootLabel: 'DSH 技能',
    rootRank: 400,
    rootWritable: true,
    name: 'demo',
    declaredName: 'demo',
    description: 'd',
    docPath: 'C:/x/demo/SKILL.md',
    entryPath: 'C:/x/demo',
    form: 'bundle',
    loadable: true,
    linked: false,
    nested: false,
    declaresModelInvocable: true,
    declaresUserInvocable: true,
    policy: { rootOn: true, skillOn: true, modelInvocable: true, userInvocable: true },
    preferred: false,
    shadowed: false,
    winner: true,
  }
  const detail = { row, body: '# body', files: ['SKILL.md'], frontmatter: { name: 'demo' } }

  const tree = views.renderDetail(t, {
    selected: { root: 'local', name: 'demo' },
    detail,
    busy: '',
    onClose: () => { closed += 1 },
    onEdit: () => {},
    onDelete: () => {},
    onExport: () => {},
    onPrefer: () => {},
  })

  // 抽屉外面必须有一层遮罩，否则「点别处关掉」无从谈起。
  assert.equal(tree.props.className, 'dsk-panel-mask')
  const panel = tree.children[0]
  assert.equal(panel.props.className, 'dsk-panel')
  assert.equal(panel.props.role, 'dialog')

  // 点遮罩 = 关闭。
  tree.props.onClick()
  assert.equal(closed, 1, 'clicking the mask must close the drawer')

  // 点抽屉内部不能关：内部点击只吞掉冒泡。
  let stopped = 0
  panel.props.onClick({ stopPropagation: () => { stopped += 1 } })
  assert.equal(stopped, 1, 'the panel must stop propagation')
  assert.equal(closed, 1, 'clicking inside the drawer must not close it')
})


test('a source group collapses to its head, and remembers nothing about rows', async () => {
  const views = await loadViews()
  views.setReact(fakeReact())
  const t = (key) => key

  const root = {
    key: 'agents',
    path: 'C:/Users/x/.agents/skills',
    label: 'Agents 技能',
    rank: 450,
    kind: 'agents',
    writable: false,
    toggleable: true,
    project: false,
    hostScans: true,
    enabled: true,
    removed: false,
    skills: [],
  }
  const row = {
    rootKey: 'agents', rootLabel: 'Agents 技能', rootRank: 450, rootWritable: false,
    name: 'doc-generator', declaredName: 'doc-generator', description: 'd',
    docPath: 'C:/x/doc-generator/SKILL.md', entryPath: 'C:/x/doc-generator', form: 'bundle',
    loadable: true, linked: false, nested: false, declaresModelInvocable: true, declaresUserInvocable: true,
    policy: { rootOn: true, skillOn: true, modelInvocable: true, userInvocable: true },
    preferred: false, shadowed: false, winner: true,
  }
  const handlers = (collapsed) => ({
    busy: '', rows: [row], collapsed,
    onToggleSource: () => {}, onToggleRemoved: () => {}, onToggleSkill: () => {},
    onOpen: () => {}, onToggleCollapsed: () => {},
  })

  // 展开：有折叠三角，也有行。
  const open = views.renderRoot(t, root, handlers(false))
  assert.ok(findClass(open, 'dsk-disclosure') !== null, 'the head must carry a disclosure control')
  assert.ok(findClass(open, 'dsk-rows') !== null, 'an expanded group renders its rows')

  // 折叠：头部还在（还能再展开、还能整体启停），但行不再渲染。
  const shut = views.renderRoot(t, root, handlers(true))
  assert.ok(findClass(shut, 'dsk-disclosure') !== null, 'the head stays when collapsed')
  assert.equal(findClass(shut, 'dsk-rows'), null, 'a collapsed group renders no rows')
})

test('neither the create form nor the import panel asks for a root key', async () => {
  const views = await loadViews()
  views.setReact(fakeReact())
  const t = (key, values) => (values === undefined ? key : key + JSON.stringify(values))

  // 新建表单：不再有「落到哪个来源」的下拉（import / local 这两个键名对用户没有意义）。
  const form = views.renderForm(t, {
    form: { mode: 'create', root: 'local', name: '', description: '', whenToUse: '', body: '' },
    busy: '',
    onChange: () => {},
    onCancel: () => {},
    onSave: () => {},
  })
  assert.equal(findClass(form, 'dsk-select'), null, 'the create form must not offer a root selector')

  // 导入面板：落点固定，入口是「选择文件夹 / 选择 ZIP」两个按钮，而不是先选来源。
  const target = { key: 'import', label: '导入技能', path: 'C:/h/tool-center/skills', writable: true, removed: false }
  const imported = views.renderImport(t, {
    state: { source: '', base64: null, candidates: [], rejected: [], picked: [], result: null },
    target,
    busy: '',
    onClose: () => {},
    onPickFolder: () => {},
    onPickZip: () => {},
    onToggle: () => {},
    onToggleAll: () => {},
    onConfirm: () => {},
  })
  assert.equal(findClass(imported, 'dsk-select'), null, 'the import panel must not offer a root selector')
  assert.ok(countClass(imported, 'dsk-pick') >= 1, 'the import panel must offer a picker button')
})

/** `h()` 允许把数组当 children 传（React 会展开），遍历时要跟着展开。 */
function childrenOf(node) {
  const raw = node?.children ?? []
  const out = []
  const push = (item) => {
    if (Array.isArray(item)) for (const inner of item) push(inner)
    else out.push(item)
  }
  for (const item of raw) push(item)
  return out
}

/** className 是按空格分词的类列表，不是单个字符串。 */
function hasClass(node, wanted) {
  const value = node?.props?.className
  return typeof value === 'string' && value.split(/\s+/).includes(wanted)
}

/** 深度找第一个带某个类的节点。 */
function findClass(node, wanted) {
  if (node === null || typeof node !== 'object') return null
  if (hasClass(node, wanted)) return node
  for (const child of childrenOf(node)) {
    const found = findClass(child, wanted)
    if (found !== null) return found
  }
  return null
}

/** 数带某个类的节点个数。 */
function countClass(node, wanted) {
  if (node === null || typeof node !== 'object') return 0
  let total = hasClass(node, wanted) ? 1 : 0
  for (const child of childrenOf(node)) total += countClass(child, wanted)
  return total
}

/** 找第一个带某个 prop 的节点。 */
function findByProp(node, name) {
  if (node === null || typeof node !== 'object') return null
  if (node.props !== undefined && Object.prototype.hasOwnProperty.call(node.props, name)) return node
  for (const child of childrenOf(node)) {
    const found = findByProp(child, name)
    if (found !== null) return found
  }
  return null
}

test('picking a folder survives clearing the input value', async () => {
  const views = await loadViews()
  views.setReact(fakeReact())
  const t = (key) => key

  const target = { key: 'import', label: '导入技能', path: 'C:/h/tool-center/skills', writable: true, removed: false }
  const picked = []
  /* 面板用特性检测决定要不要给「选择文件夹」按钮；node 里没有 document，所以先补一个
     最小的桩，让文件夹分支真的被渲染出来（不然这条测试只会测到 ZIP 入口）。 */
  const previousDocument = globalThis.document
  globalThis.document = { createElement: () => ({ webkitdirectory: '' }) }
  const tree = views.renderImport(t, {
    state: { source: '', base64: null, candidates: [], rejected: [], picked: [], result: null },
    target,
    busy: '',
    onClose: () => {},
    onPickFolder: (files) => picked.push(...files),
    onPickZip: () => {},
    onToggle: () => {},
    onToggleAll: () => {},
    onConfirm: () => {},
  })

  // 文件夹入口用 webkitdirectory 标记。
  const input = findByProp(tree, 'webkitdirectory')
    ?? findByProp(tree, 'directory')
    ?? findByProp(tree, 'multiple')
  globalThis.document = previousDocument
  assert.ok(input !== null, 'a folder picker must exist')

  /* 仿真真实 <input type=file>：FileList 是**活的视图** —— 清空 value 会让它同时变空。
     这里用 Proxy 转发到同一个底层数组，才真的等价（普通数组的旧引用不会跟着空）。
     这正是曾经「选完没反应」的原因：先取引用、后清空，等读取时已经空了。 */
  const entries = [{ name: 'SKILL.md', webkitRelativePath: 'my-skill/SKILL.md' }]
  const liveFiles = new Proxy(entries, {})
  const state = { value: 'C:\\fakepath\\my-skill' }
  const fakeTarget = {
    get files() { return liveFiles },
    get value() { return state.value },
    set value(next) { state.value = next; if (next === '') entries.length = 0 },
  }

  input.props.onChange({ target: fakeTarget })
  assert.equal(picked.length, 1, 'the picked file must reach the handler despite clearing the input')
  assert.equal(picked[0].webkitRelativePath, 'my-skill/SKILL.md')
  assert.equal(state.value, '', 'the input is still reset so the same folder can be picked again')
})

test('the import panel only imports what is ticked', async () => {
  const views = await loadViews()
  views.setReact(fakeReact())
  const t = (key, values) => (values === undefined ? key : key + JSON.stringify(values))
  const target = { key: 'import', label: '导入技能', path: 'C:/h/x', writable: true, removed: false }

  const candidates = [
    { name: 'alpha-skill', files: 3, exists: false },
    { name: 'beta-skill', files: 1, exists: false },
    { name: 'old-skill', files: 2, exists: true },
  ]
  const tree = views.renderImport(t, {
    state: { source: 'my-skills', base64: 'AAAA', candidates, rejected: [], picked: ['alpha-skill'], result: null },
    target,
    busy: '',
    onClose: () => {},
    onPickFolder: () => {},
    onPickZip: () => {},
    onToggle: () => {},
    onToggleAll: () => {},
    onConfirm: () => {},
  })

  // 每条候选一行勾选；已存在的那条要被禁用（它本来也导不进去）。
  const boxes = []
  walk(tree, (node) => {
    if (node?.props?.type === 'checkbox') boxes.push(node)
  })
  assert.equal(boxes.length, 3, 'one checkbox per candidate')
  assert.equal(boxes[0].props.checked, true, 'the picked one is ticked')
  assert.equal(boxes[1].props.checked, false)
  assert.equal(boxes[2].props.disabled, true, 'an already-present skill cannot be picked')

  // 确认按钮上的数字要跟着勾选走（只算能导入的）。
  const labels = []
  walk(tree, (node) => {
    if (node?.type === 'button' && typeof node.props?.className === 'string') labels.push(String(node.children?.[0] ?? ''))
  })
  assert.ok(labels.some((label) => label.startsWith('import.confirm')), 'a confirm button must exist')
  assert.ok(labels.some((label) => label.includes('"n":1')), 'the confirm button counts the ticked skills only')
})

/** 前序遍历节点树。 */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  visit(node)
  for (const child of childrenOf(node)) walk(child, visit)
}