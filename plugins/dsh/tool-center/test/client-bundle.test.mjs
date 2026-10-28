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

function fakeReact() {  const calls = { elements: 0 }
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

test('the client plugin mounts a sidebar icon and its main panel under one id', async () => {
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

  // 挂载点是左侧栏（图标 + 主栏面板），不再是设置页的 settings.section。
  assert.equal(injections.includes('settings.section'), false, 'the panel must not live in the settings page')
  assert.equal(injections.includes('sidebar.panellist'), true)
  assert.equal(injections.includes('main'), true)
  assert.equal(injections.includes('conversation.hero.options'), true, 'the new-session row gets the scene picker')
  assert.equal(registrations.length, 3)

  const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist').options
  assert.equal(sidebar.id, 'tool-center')
  assert.equal(sidebar.locale, 'tool-center')
  assert.equal(typeof sidebar.order, 'number')
  assert.equal(sidebar.label(), '工具中心')

  // 两个栏位靠同一个 id 配对：点侧栏图标就打开这块面板。
  const main = registrations.find((entry) => entry.options.name === 'main').options
  assert.equal(main.key, sidebar.id, 'the main panel must pair with the sidebar entry by id')
  assert.equal(main.locale, 'tool-center')
  assert.equal(typeof registrations.find((entry) => entry.options.name === 'main').component, 'function')

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

test('the error alert never paints red text on a solid red fill', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  // 浅色主题里 state-error-secondary 是实心红（red-400），拿它当底色 + primary 当文字
  // 就是红底红字（用户看到的「被红色框框遮住」）。错误条必须用 primary 的 12% 混底色。
  const alertRule = code.slice(code.indexOf('.dsk-alert-err{'), code.indexOf('.dsk-alert-err{') + 400)
  assert.ok(alertRule.includes('color-mix'), 'the error surface is a tint of the error color')
  assert.equal(
    /\.dsk-alert-err\{[^}]*background:var\(--dsw-alias-state-error-secondary/.test(code),
    false,
    'state-error-secondary is a solid fill in the light theme and must not be used as an alert background',
  )
  assert.ok(alertRule.includes('var(--dsw-alias-state-error-primary'), 'the text uses the paired error color')
})

test('a 404/405 means the plugin is gone, not a data error', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  // 停用插件后宿主没有这条路由：识别成「已停用」并广播，界面据此自我卸载，
  // 而不是在面板里刷一片读不懂的错误。
  assert.ok(code.includes('error.pluginUnavailable'), 'the gone case has its own code')
  assert.ok(code.includes('onPluginGone'), 'the bundle exposes the teardown subscription')
  assert.ok(code.includes('response.status === 404 || response.status === 405'), 'both statuses are recognized')
})

test('disable and re-enable are symmetric: the panel tears itself down AND mounts itself back', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  assert.ok(code.includes('onPluginGone'), 'the bundle subscribes to the gone signal')
  assert.ok(code.includes('onPluginRevived'), 'and to the revived signal — otherwise re-enabling never brings the icon back')
  assert.ok(code.includes('isPluginGone'), 'the probe knows whether it is in the gone state')
  assert.ok(code.includes('tool-center: unload guard') && code.includes('tool-center: revive guard'), 'both guards are installed')
  assert.ok(/setInterval\(\(\) => \{[\s\S]{0,400}?\}, 5(e3|000)\)/.test(code), 'a bounded retry keeps probing while gone')
})

test('the new-session scene picker is drawn by us, not by a native select', async () => {
  const code = await readFile(join(root, 'dist', 'client.js'), 'utf8')
  // 原生 <select> 的弹出层由系统绘制，深色主题下会变成「白底浅灰字」——
  // 所以这里必须是自己画的列表，并且颜色走宿主 token。
  assert.ok(code.includes('dsk-scene-pick-btn'), 'the closed control has its own class')
  assert.ok(code.includes('dsk-scene-pick-list'), 'the open list has its own class')
  assert.ok(code.includes('"aria-haspopup": "listbox"'), 'the control advertises a listbox popup')
  // 只看这个组件附近：面板里的 selectOf 是合法的原生 select，不该被这条断言牵连。
  const around = code.slice(Math.max(0, code.indexOf('dsk-scene-pick-btn') - 400), code.indexOf('dsk-scene-pick-btn') + 4000)
  assert.equal(around.includes('"select"'), false, 'the picker itself renders no native select')
  assert.ok(code.includes('--dsw-alias-bg-layer-1'), 'the list background follows the host theme token')
})
