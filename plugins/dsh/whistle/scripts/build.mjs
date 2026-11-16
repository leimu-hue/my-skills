/**
 * 构建 Harness 真正加载的产物：src/host 下的 TypeScript -> dist/host 同结构。
 *
 * 本插件只有 Host 一半（没有 Web 客户端），所以工具链只需要 tsc，
 * 不需要 esbuild —— 与 `related-projects` / `tool-center` 的客户端打包区分开。
 *
 * 工具链解析顺序：
 *   1. 本包自己的 node_modules（正常 `npm install`）；
 *   2. `DSH_PLUGIN_TOOLCHAIN`（其 node_modules 里有 typescript 的目录）；
 *   3. `../related-projects/node_modules` —— 本仓库另一个本地插件，
 *      这样没有网络的 checkout 也能构建。
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
 * 那种情况下**不能**让构建失败：tsc 是整文件覆盖，原地重建照样得到正确产物。
 * 代价是「源码里删掉的文件」会留下旧产物，所以这里明确告警。
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

const tsc = spawnSync(process.execPath, [toolchain.tsc, '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('[build] host type-check/emit failed')
  process.exit(tsc.status ?? 1)
}

for (const artifact of ['dist/host/index.js', 'dist/host/tools/index.js']) {
  if (!existsSync(join(root, artifact))) {
    console.error('[build] missing artifact: ' + artifact)
    process.exit(1)
  }
}

console.log('[build] ok -> dist/host/index.js')
console.log('[build] toolchain: ' + toolchain.base)
if (!cleaned) console.log('[build] note: in-place rebuild, dist was not emptied')
