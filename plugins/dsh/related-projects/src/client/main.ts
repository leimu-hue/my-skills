/**
 * 打包入口：Web shell 加载的那一个文件。
 *
 * Host 的模块加载器提供 `require`；React 来自它的模块表，
 * 不来自这个包。见 scripts/build.mjs——esbuild 把 `src/client/` 的其余
 * 部分打进这一个文件。
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
  id: '@local/dsh-related-projects',
  factory(require) {
    return createPlugin(require('react'))
  },
})
