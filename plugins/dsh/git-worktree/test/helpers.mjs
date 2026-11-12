/**
 * 临时 Git 仓库的测试夹具。
 *
 * 两个测试文件都要「建一个真实仓库再操作」；夹具只写一份，避免两边的
 * `git()` 参数（locale、禁交互、autocrlf）慢慢漂移。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TIMEOUT = 60_000

export function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  }).trim()
}

/** 初始化一个带两次提交的仓库（含子目录），返回 HEAD。 */
export function makeRepository(root) {
  mkdirSync(root, { recursive: true })
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['config', 'user.email', 'test@example.com'])
  /* 断言按字节比较，所以不让宿主机的 autocrlf 改写换行。 */
  git(root, ['config', 'core.autocrlf', 'false'])
  writeFileSync(join(root, 'a.txt'), 'hello\n')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'b.txt'), 'world\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'init'])
  return git(root, ['rev-parse', 'HEAD'])
}
