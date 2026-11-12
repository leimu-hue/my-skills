/**
 * Git 命令目录的守门测试。
 *
 * 三件事：
 *   1. 目录本身可用（名字唯一、用途非空）；
 *   2. 源码里**没有**绕过目录的裸 git 调用（`runGit([...])` / `spawn('git')`）；
 *   3. 目录覆盖了这些场景——新增 git 操作必须先进 `commands.ts`。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GIT_COMMANDS, Git } from '../dist/host/git/commands.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceRoot = join(root, 'src', 'host')

function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

test('the command catalogue is complete and self-describing', () => {
  const names = GIT_COMMANDS.map((command) => command.name)
  assert.equal(new Set(names).size, names.length, '命令名重复')
  assert.ok(names.length >= 25, '命令数突然变少，可能有人删条目没删调用方')
  for (const command of GIT_COMMANDS) {
    assert.ok(command.purpose.length > 4, `${command.name} 缺少用途说明`)
    assert.ok(['none', 'index', 'worktree', 'refs', 'registration'].includes(command.effect))
  }
  /* 构建器与清单一一对应：两边数量一致才说明没有孤儿。 */
  assert.equal(Object.keys(Git).length, GIT_COMMANDS.length)
})

test('every git call goes through the catalogue', () => {
  const offenders = []
  for (const file of sourceFiles(sourceRoot)) {
    if (file.endsWith(join('git', 'exec.ts'))) continue
    const text = readFileSync(file, 'utf8')
    /* 裸数组 = 绕过 commands.ts。注释里提到命令名不算。 */
    for (const pattern of [/runGit\(\s*\[/, /gitText\(\s*\[/, /gitOid\(\s*\[/, /spawn\(\s*'git'/]) {
      if (pattern.test(text)) offenders.push(`${file.replace(root, '')} :: ${pattern}`)
    }
  }
  assert.deepEqual(offenders, [], '这些位置绕过了 Git 命令目录')
})

test('the catalogue covers the behaviours the plugin depends on', () => {
  const names = new Set(GIT_COMMANDS.map((command) => command.name))
  for (const name of [
    'probeLayout',
    'currentBranch',
    'headOid',
    'worktreeList',
    'worktreeAdd',
    'worktreeRemove',
    'worktreePrune',
    'checkoutIndexAll',
    'binaryPatch',
    'applyCheck',
    'apply',
    'forEachRefContaining',
    'commitTree',
    'updateRef',
  ]) {
    assert.ok(names.has(name), `目录里缺少 ${name}`)
  }
})
