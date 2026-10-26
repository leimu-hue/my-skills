/**
 * 构建 Harness 真正加载的两个产物。
 *
 *   Host   src/host 下的 TypeScript -> dist/host 下同结构（tsc，原生 ESM，一个模块一个文件，保留目录树）
 *   Client src/client/main.ts -> dist/client.js   （esbuild 打包：Web 外壳每个插件
 *                                                  只加载一个文件）
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

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })

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
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  nodePaths: [join(toolchain.base, 'node_modules')],
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
