import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 四个域视图现在都是真正的 React 组件（JSX + `import { useEffect } from 'react'`），
 * 所以这里在打包时把 `react` / `react/jsx-runtime` 换成本测试的快照实现：组件被直接调用
 * 一次，就能看清它在空数据下渲染出的元素树 ——「坏 import、hook 顺序、对 undefined 取字段」
 * 在这里就暴露，而不是等用户点开那个页签。
 */
const REACT_SHIM = `
const fake = () => globalThis.__fakeReact
export const useState = (initial) => fake().useState(initial)
export const useEffect = (fn, deps) => fake().useEffect(fn, deps)
export const useMemo = (fn, deps) => fake().useMemo(fn, deps)
export const useCallback = (fn, deps) => fake().useCallback(fn, deps)
export const useRef = (initial) => fake().useRef(initial)
export const createElement = (type, props, ...children) => fake().createElement(type, props, ...children)
export const Fragment = 'Fragment'
`

const JSX_SHIM = `
const fake = () => globalThis.__fakeReact
export const Fragment = 'Fragment'
export const jsx = (type, props) => fake().createElement(type, props)
export const jsxs = (type, props) => fake().createElement(type, props)
`

const fakeReactPlugin = {
  name: 'fake-react',
  setup(build) {
    build.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (args) => ({ path: args.path, namespace: 'fake-react' }))
    build.onLoad({ filter: /.*/, namespace: 'fake-react' }, (args) => ({
      contents: args.path === 'react/jsx-runtime' ? JSX_SHIM : REACT_SHIM,
      loader: 'js',
    }))
  },
}

async function loadViews() {
  const esbuild = await import('esbuild')
  const work = await mkdtemp(join(tmpdir(), 'tc-views-'))
  const entry = join(root, 'test', '.views-entry.ts')
  await writeFile(entry, [
    "export { SkillsView } from '../src/client/components/skills/view.tsx'",
    "export { PromptsView } from '../src/client/components/prompts/view.tsx'",
    "export { McpView } from '../src/client/components/mcp/view.tsx'",
    "export { ScenesView } from '../src/client/components/scenes/view.tsx'",
    "export { renderDetail } from '../src/client/components/skills/detail.tsx'",
    "export { renderRoot } from '../src/client/components/skills/root.tsx'",
    "export { renderImport } from '../src/client/components/skills/import.tsx'",
    "export { renderForm } from '../src/client/components/skills/form.tsx'",
    "export { noteOf } from '../src/client/components/ui/atoms.tsx'",
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
      jsx: 'automatic',
      logLevel: 'silent',
      plugins: [fakeReactPlugin],
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
  const react = {
    get created() {
      return created
    },
    createElement(type, props, ...children) {
      created += 1
      const shape = props ?? {}
      // JSX 的自动运行时把子节点放在 props.children 里；直接调用 createElement 的测试则
      // 走可变参数。两种形状在这里归一成带 `children` 数组的节点。
      const kids = children.length > 0
        ? children
        : (shape.children === undefined ? [] : Array.isArray(shape.children) ? shape.children : [shape.children])
      return { type, props: shape, children: kids }
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
  globalThis.__fakeReact = react
  return react
}

test('every domain view renders once on an empty payload', async () => {
  const views = await loadViews()
  const React = fakeReact()
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

test('a long note is clipped to one line and keeps the full text in title', async () => {
  const views = await loadViews()
  fakeReact()

  assert.equal(views.noteOf(''), null, 'an empty note renders nothing')
  assert.equal(views.noteOf('   '), null, 'a whitespace-only note renders nothing')

  const short = views.noteOf('创建 DIC 任务')
  assert.equal(short.props.className, 'dsk-note')
  assert.equal(short.children[0], '创建 DIC 任务')
  assert.equal(short.props.title, undefined, 'no tooltip while nothing is clipped')

  const source = `第一段\n第二段  ${'x'.repeat(120)}`
  const long = views.noteOf(source)
  assert.equal(long.children[0].length, 61, 'default cap is 60 characters plus the ellipsis')
  assert.ok(long.children[0].endsWith('…'), 'the clip uses an ellipsis, not three dots')
  assert.ok(!long.children[0].includes('\n'), 'newlines are folded before clipping')
  assert.ok(long.props.title.includes('x'.repeat(120)), 'the full text is still available on hover')
})

test('the detail drawer sits in a mask, and only the mask closes it', async () => {
  const views = await loadViews()
  fakeReact()
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
  fakeReact()
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
  fakeReact()
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
    state: { source: '', base64: null, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: null },
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
  fakeReact()
  const t = (key) => key

  const target = { key: 'import', label: '导入技能', path: 'C:/h/tool-center/skills', writable: true, removed: false }
  const picked = []
  /* 面板用特性检测决定要不要给「选择文件夹」按钮；node 里没有 document，所以先补一个
     最小的桩，让文件夹分支真的被渲染出来（不然这条测试只会测到 ZIP 入口）。 */
  const previousDocument = globalThis.document
  globalThis.document = { createElement: () => ({ webkitdirectory: '' }) }
  const tree = views.renderImport(t, {
    state: { source: '', base64: null, candidates: [], rejected: [], orphans: [], ignored: [], picked: [], result: null },
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
  fakeReact()
  const t = (key, values) => (values === undefined ? key : key + JSON.stringify(values))
  const target = { key: 'import', label: '导入技能', path: 'C:/h/x', writable: true, removed: false }

  const candidates = [
    { name: 'alpha-skill', files: 3, exists: false },
    { name: 'beta-skill', files: 1, exists: false },
    { name: 'old-skill', files: 2, exists: true },
  ]
  const tree = views.renderImport(t, {
    state: { source: 'my-skills', base64: 'AAAA', candidates, rejected: [], orphans: [], ignored: [], picked: ['alpha-skill'], result: null },
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

test('the import panel lists one row per stray file and folds away the ignored ones', async () => {
  const views = await loadViews()
  fakeReact()
  // 只放这两条词条：它证明原因确实按 code 走了词典（词典里没有的才用宿主那句话）。
  const dict = {
    'import.reason.noDoc': '所在目录没有 SKILL.md',
    'import.reason.bundleDoc': 'bundle 级说明或清单',
  }
  const t = (key, values) => {
    if (values !== undefined) return key + JSON.stringify(values)
    return dict[key] ?? key
  }
  const target = { key: 'import', label: '导入技能', path: 'C:/h/x', writable: true, removed: false }

  const tree = views.renderImport(t, {
    state: {
      source: 'bundle.zip',
      base64: 'AAAA',
      candidates: [{ name: 'alpha-skill', files: 2, exists: false }],
      rejected: [{ name: 'Bad_Name', reason: '技能名不合法' }],
      orphans: [
        { path: 'bundle/broken/references/notes.md', code: 'noDoc', reason: 'host sentence' },
        { path: 'bundle/other/a.md', code: 'noDoc', reason: 'host sentence' },
      ],
      ignored: [{ path: 'bundle/bundle-manifest.json', code: 'bundleDoc', reason: 'host sentence' }],
      picked: ['alpha-skill'],
      result: null,
    },
    target,
    busy: '',
    onClose: () => {},
    onPickFolder: () => {},
    onPickZip: () => {},
    onToggle: () => {},
    onToggleAll: () => {},
    onConfirm: () => {},
  })

  // 一条诊断一行：1 条技能级 + 2 条文件级（无关文件另在折叠区里，也各占一行）。
  assert.equal(countClass(tree, 'dsk-fail'), 4, 'each problem gets its own row')
  // 路径确实渲染出来了（不是聚合成一句话），问题在前、被忽略的在折叠区里。
  const paths = []
  walk(tree, (node) => {
    if (hasClass(node, 'dsk-fail-path')) paths.push(String(node.children?.[0] ?? ''))
  })
  assert.deepEqual(paths, [
    'Bad_Name',
    'bundle/broken/references/notes.md',
    'bundle/other/a.md',
    'bundle/bundle-manifest.json',
  ])
  // 原因按 code 走词典，词典里没有才用宿主那句话。
  const reasons = []
  walk(tree, (node) => {
    if (hasClass(node, 'dsk-fail-reason')) reasons.push(String(node.children?.[0] ?? ''))
  })
  assert.deepEqual(reasons, [
    '技能名不合法',
    '所在目录没有 SKILL.md',
    '所在目录没有 SKILL.md',
    'bundle 级说明或清单',
  ])
  // 无关文件折叠着只报个数，但仍然可展开。
  const folded = findClass(tree, 'dsk-fails-more')
  assert.ok(folded !== null, 'ignored files are summarised, not dropped')
  assert.equal(folded.type, 'details')
})

/** 前序遍历节点树。 */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  visit(node)
  for (const child of childrenOf(node)) walk(child, visit)
}