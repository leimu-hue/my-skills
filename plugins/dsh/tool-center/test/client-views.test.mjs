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
