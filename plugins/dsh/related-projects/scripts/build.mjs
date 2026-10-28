/**
 * 构建 Harness 实际加载的两个产物。
 *
 *   Host   src/host/*.ts     -> dist/host/*.js   (tsc、原生 ESM、每个模块一个文件)
 *   Client src/client/main.ts -> dist/client.js   (esbuild：Web 外壳每个插件只加载一个文件)
 *
 * Client 产物与随附插件同形：一个 `__ModuleLoader__.load({ id, factory })`
 * 调用，factory 内是 CJS 模块体，react 等平台模块经 factory 的 `require` 解析。
 * 因此 esbuild 用 cjs 格式输出，banner/footer 只负责补上 factory 外壳。
 *
 * 运行方式：npm run build
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
const PLUGIN_ID = '@local/dsh-related-projects'

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })

const tsc = spawnSync('node', [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('[build] host type-check/emit failed')
  process.exit(tsc.status ?? 1)
}

await build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src', 'client', 'main.ts')],
  outfile: join(dist, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  /* 平台模块由加载器提供，绝不打进 bundle。 */
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  legalComments: 'none',
  logLevel: 'info',
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      '  id: ' + JSON.stringify(PLUGIN_ID) + ',',
      '  factory: (require) => {',
      '    var module = { exports: {} };',
      '    var exports = module.exports;',
      '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    ].join('\n'),
  },
  footer: {
    js: [
      '    return module.exports;',
      '  },',
      '});',
    ].join('\n'),
  },
})

for (const artifact of ['dist/host/index.js', 'dist/client.js']) {
  if (!existsSync(join(root, artifact))) {
    console.error('[build] missing artifact: ' + artifact)
    process.exit(1)
  }
}
console.log('[build] ok -> dist/host/index.js, dist/client.js')
