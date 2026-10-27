/**
 * 构建 Host 产物：src/host 下的 TypeScript -> dist/host 同名结构（原生 ESM）。
 *
 * 工具链解析顺序（与同仓库其它本地插件一致）：
 *   1. 本包自己的 node_modules；
 *   2. `DSH_PLUGIN_TOOLCHAIN`；
 *   3. `../related-projects/node_modules`。
 *
 * 运行：npm run build
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

function resolveToolchain() {
  const candidates = [
    root,
    process.env.DSH_PLUGIN_TOOLCHAIN ?? '',
    join(root, '..', 'related-projects'),
    join(root, '..', 'tool-center'),
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

const tsc = spawnSync('node', [toolchain.tsc, '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('[build] host type-check/emit failed')
  process.exit(tsc.status ?? 1)
}

if (!existsSync(join(root, 'dist', 'host', 'index.js'))) {
  console.error('[build] missing artifact: dist/host/index.js')
  process.exit(1)
}

console.log('[build] ok -> dist/host/')
console.log('[build] toolchain: ' + toolchain.base)
