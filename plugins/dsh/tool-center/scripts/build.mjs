/**
 * 构建 Harness 真正加载的两个产物。
 *
 *   Host   src/host 下的 TypeScript -> dist/host 下同结构（tsc，原生 ESM，一个模块一个文件，保留目录树）
 *   Client src/client/main.ts -> dist/client.js   （esbuild 打包：Web 外壳每个插件
 *                                                  只加载一个文件）
 *
 * Client 产物与随附插件同形：一个 `__ModuleLoader__.load({ id, factory })` 调用，factory
 * 内是 CJS 模块体。**外壳由这里的 banner/footer 提供**，所以 `src/client/main.ts` 只是
 * 普通模块（具名导出 `apply` / `inject`），可以照常 `import React`、写 JSX —— react 与
 * react/jsx-runtime 由平台模块表提供，绝不打进 bundle。
 *
 * 工具链解析顺序：
 *   1. 本包自己的 node_modules（正常 `npm install`）；
 *   2. `DSH_PLUGIN_TOOLCHAIN`（其 node_modules 里有 esbuild + typescript 的目录）；
 *   3. `../related-projects/node_modules` —— 本仓库另一个本地插件，
 *      这样没有网络的 checkout 也能构建。
 *
 * 运行：npm run build
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
const PLUGIN_ID = '@local/dsh-tool-center'

function resolveToolchain() {
  const candidates = [
    root,
    process.env.DSH_PLUGIN_TOOLCHAIN ?? '',
    join(root, '..', 'related-projects'),
  ].filter((candidate) => candidate !== '')
  for (const candidate of candidates) {
    const tsc = join(candidate, 'node_modules', 'typescript', 'bin', 'tsc')
    if (existsSync(tsc)) return { base: candidate, tsc }
  }
  return null
}

const toolchain = resolveToolchain()
if (toolchain === null) {
  console.error('[build] no typescript found. Run `npm install` here, or set DSH_PLUGIN_TOOLCHAIN.')
  process.exit(1)
}

/**
 * 清掉上一次的产物。
 *
 * 桌面应用正在运行时会占住已加载的 `dist/host/*.js`，Windows 就拒绝删目录（EPERM）。
 * 那种情况下**不能**让构建失败：tsc / esbuild 都是整文件覆盖，原地重建照样得到正确产物。
 * 代价是「源码里删掉的文件」会留下旧产物，所以这里明确告警，建议重启应用后再全量构建。
 */
let cleaned = true
if (existsSync(dist)) {
  try {
    rmSync(dist, { recursive: true, force: true })
  } catch (cause) {
    cleaned = false
    console.warn('[build] dist is locked (the desktop app is probably running); building in place.')
    console.warn('[build] stale files from deleted sources may remain until the next clean build.')
    console.warn('[build] reason: ' + (cause?.code ?? String(cause)))
  }
}

/** esbuild 也从同一套工具链解析，因此不需要额外安装。 */
async function loadEsbuild() {
  const direct = join(toolchain.base, 'node_modules', 'esbuild', 'lib', 'main.js')
  if (!existsSync(direct)) {
    console.error('[build] esbuild not found under ' + toolchain.base)
    process.exit(1)
  }
  const module = await import(pathToFileURL(direct).href)
  return module.build ?? module.default?.build
}

const tsc = spawnSync('node', [toolchain.tsc, '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('[build] host type-check/emit failed')
  process.exit(tsc.status ?? 1)
}

const build = await loadEsbuild()

const result = await build({
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
  metafile: true,
  logLevel: 'warning',
  nodePaths: [join(toolchain.base, 'node_modules')],
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

const clientBytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0)
console.log('[build] ok -> dist/host/index.js, dist/client.js (' + (clientBytes / 1024).toFixed(1) + ' KiB)')
console.log('[build] toolchain: ' + toolchain.base)
if (!cleaned) console.log('[build] note: in-place rebuild, dist was not emptied')
