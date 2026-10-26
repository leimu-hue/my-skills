/**
 * Bundle 入口：Web 外壳加载的唯一一个文件。
 *
 * 宿主的模块加载器提供 `require`；React 来自它的模块表，绝不是这个 bundle 里的一份。
 * 见 scripts/build.mjs —— esbuild 把 `src/client/` 其余部分打进这一个文件。
 */
import { createPlugin } from './plugin.js'

interface LoaderWindow {
  __ModuleLoader__: {
    load(bundle: {
      id: string
      factory(require: (id: string) => unknown): unknown
    }): void
  }
}

const scope = window as unknown as LoaderWindow

scope.__ModuleLoader__.load({
  id: '@local/dsh-tool-center',
  factory(require) {
    return createPlugin(require('react'))
  },
})
