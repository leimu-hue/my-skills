/**
 * 构建 Harness 实际加载的两个产物。
 *
 *   Host   src/host/*.ts     -> dist/host/*.js   (tsc、原生 ESM、每个模块一个文件)
 *   Client src/client/main.ts -> dist/client.js   (esbuild bundle：Web 外壳
 *                                                  每个插件只加载一个文件)
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
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  legalComments: 'none',
  logLevel: 'info',
})

for (const artifact of ['dist/host/index.js', 'dist/client.js']) {
  if (!existsSync(join(root, artifact))) {
    console.error('[build] missing artifact: ' + artifact)
    process.exit(1)
  }
}
console.log('[build] ok -> dist/host/index.js, dist/client.js')
