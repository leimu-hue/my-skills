/**
 * 产物体检：Host 是 tsc 的多文件输出，Client 是单文件 bundle。
 *
 * 刻意只做静态断言、不 import Host 入口：目标机器上 `node --test` 没有
 * `@deepseek-ai/schemastery` 的运行时解析路径（它由 DSH 提供），import 会失败。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (path) => readFileSync(join(root, path), 'utf8')

test('host artifact exposes the plugin face', () => {
  const source = read('dist/host/index.js')
  assert.match(source, /export const name = 'git-worktree'/)
  assert.match(source, /export const inject = \['webServer'\]/)
  assert.match(source, /export const Config/)
  assert.match(source, /export function apply/)
})

test('client bundle is a module-loader payload', () => {
  const bundle = read('dist/client.js')
  assert.match(bundle, /window\.__ModuleLoader__\.load\(/)
  assert.match(bundle, /@local\/dsh-git-worktree/)
  /* react 由平台模块表提供，绝不打进 bundle。 */
  assert.ok(!bundle.includes('node_modules/react/index.js'))
  assert.match(bundle, /sidebar\.panellist/)
})

test('package exports point at real files', () => {
  const pkg = JSON.parse(read('package.json'))
  for (const target of Object.values(pkg.exports)) {
    assert.equal(existsSync(join(root, target)), true, target)
  }
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(existsSync(join(root, 'dist/host/index.js')), true)
})

test('the patch file inserts exactly one host row', () => {
  const patch = read('cordis.patch.yml')
  assert.match(patch, /id: git-worktree/)
  assert.match(patch, /name: '@local\/dsh-git-worktree'/)
})
