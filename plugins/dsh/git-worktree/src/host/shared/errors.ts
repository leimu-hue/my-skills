/**
 * 稳定的失败类型：Host 只抛这一种，HTTP 层把它翻译成 `{ code }`，
 * Client 用 code 查自己的词典——错误文案不跨进程传输。
 */
export type ErrorCode =
  | 'bad-request'
  | 'bad-json'
  | 'too-large'
  | 'not-a-repository'
  | 'unknown-worktree'
  | 'duplicate-worktree'
  | 'duplicate-branch'
  | 'invalid-name'
  | 'invalid-layout'
  | 'worktree-dirty'
  | 'worktree-unmerged'
  | 'worktree-unpushed'
  | 'worktree-missing'
  | 'worktree-external'
  | 'git-failed'
  | 'apply-conflict'
  | 'no-workspace'
  | 'not-a-workspace'
  | 'forbidden'

export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message?: string) {
    super(message !== undefined && message !== '' ? message : code)
    this.name = 'DomainError'
    this.code = code
  }
}

/** 把任意异常收成一条可读文本；分类仍由 `DomainError` 承担。 */
export function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
