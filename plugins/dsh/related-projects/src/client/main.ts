/**
 * Bundle entry: the one file the Web shell loads.
 *
 * The host module loader provides `require`; React comes from its module table,
 * never from this bundle. See scripts/build.mjs — esbuild bundles the rest of
 * `src/client/` into this single file.
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
