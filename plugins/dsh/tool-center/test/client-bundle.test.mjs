import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 浏览器半侧只在 Web 外壳里运行，而外壳提供 `window.__ModuleLoader__`、`document` 与 React。
 * 这个测试把这三样都造出来，于是「bundle 一求值就抛错」的毛病（顶层访问 `document`、
 * import 写错、渲染路径里的笔误）在这里就暴露，而不是等用户重启后在他的浏览器里炸。
 */
async function loadBundle() {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  const captured = { bundle: null }
  const style = { setAttribute() {}, textContent: '', remove() {} }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(bundle) {
          captured.bundle = bundle
        },
      },
    },
    document: {
      baseURI: 'http://127.0.0.1:55177/',
      head: { appendChild() {} },
      body: { appendChild() {}, removeChild() {} },
      createElement: () => style,
    },
    URL,
    setTimeout,
    clearTimeout,
    console,
    fetch: () => Promise.reject(new Error('network disabled in test')),
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 'client.js' })
  assert.ok(captured.bundle !== null, 'the bundle must register itself with the module loader')
  return { bundle: captured.bundle, sandbox }
}

function fakeReact() {
  const calls = { elements: 0 }
  return {
    calls,
    createElement(type, props, ...children) {
      calls.elements += 1
      return { type, props: props ?? {}, children }
    },
    // Hooks：够走完一次渲染、暴露坏调用即可。
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

test('the client bundle registers itself with the module loader id', async () => {
  const { bundle } = await loadBundle()
  assert.equal(bundle.id, '@local/dsh-tool-center')
  assert.equal(typeof bundle.factory, 'function')
})

test('the client plugin mounts a settings.section registration', async () => {
  const { bundle } = await loadBundle()
  const React = fakeReact()
  const plugin = bundle.factory((id) => {
    assert.equal(id, 'react')
    return React
  })
  assert.equal(typeof plugin.apply, 'function')
  // 元素逐个比较：bundle 跑在 vm 上下文里，它的数组来自另一个 realm，deepEqual 会比较原型。
  assert.equal(plugin.inject.length, 1)
  assert.equal(plugin.inject[0], 'slots')

  const registrations = []
  const injections = []
  const dictionaries = []
  const ctx = {
    get(serviceName) {
      if (serviceName === 'slots') {
        return {
          inject(key, callback) {
            injections.push(key)
            return callback()
          },
          register(options, component) {
            registrations.push({ options, component })
            return () => {}
          },
        }
      }
      if (serviceName === 'locale') {
        return {
          register(ns, dicts) {
            dictionaries.push({ ns, dicts })
            return () => {}
          },
          getSnapshot: () => ({ active: 'zh-CN' }),
        }
      }
      return undefined
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject(names, callback) {
      callback(ctx)
    },
  }

  plugin.apply(ctx)

  assert.equal(injections.length, 1)
  assert.equal(injections[0], 'settings.section')
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.name, 'settings.section')
  assert.equal(registrations[0].options.id, 'tool-center')
  assert.equal(registrations[0].options.order, 17)
  assert.equal(registrations[0].options.locale, 'tool-center')
  assert.equal(typeof registrations[0].options.label(), 'string')
  assert.equal(registrations[0].options.label(), '工具中心')

  // zh 词典是键集的事实来源，必须覆盖面板用到的键。
  assert.equal(dictionaries.length, 1)
  const zh = dictionaries[0].dicts.zh
  const en = dictionaries[0].dicts.en
  for (const key of ['nav.title', 'page.subtitle', 'page.search', 'detail.edit', 'common.save', 'trash.title', 'import.title']) {
    assert.ok(typeof zh[key] === 'string' && zh[key] !== '', 'zh dictionary is missing ' + key)
  }
  // 词条按域分文件，所以两个语言必须键集完全一致：缺键会回退成键名，而那会显示在面板上。
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'zh and en must cover the same keys')
})

test('the page renders one pass without throwing', async () => {
  const { bundle } = await loadBundle()
  const React = fakeReact()
  const plugin = bundle.factory(() => React)

  let component = null
  const ctx = {
    get(serviceName) {
      if (serviceName === 'slots') {
        return {
          inject(_key, callback) {
            return callback()
          },
          register(_options, registered) {
            component = registered
            return () => {}
          },
        }
      }
      if (serviceName === 'locale') {
        return { register: () => () => {}, getSnapshot: () => ({ active: 'en' }) }
      }
      return undefined
    },
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject(_names, callback) {
      callback(ctx)
    },
  }
  plugin.apply(ctx)
  assert.equal(typeof component, 'function')

  const tree = component({})
  assert.ok(tree !== null && typeof tree === 'object', 'the page must return an element')
  assert.ok(React.calls.elements > 0)
})
