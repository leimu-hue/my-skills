/**
 * 路径写法与 `@` 引用语法——凡是要用其中之一的都共用同一份实现（菜单行、
 * 输入框行的插入、面板标题）。
 *
 * 引用语法要求 `@` 位于行首或紧跟空白，而绝对的 Host 路径从不出现在补全菜单里
 * （那个菜单以会话 cwd 为界），所以词条以纯文本插入，模型读到的就是一条显式
 * 引用。
 */
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client'

/** 用 `/` 书写的路径，不带尾部斜杠。 */
export function slashPath(path: unknown): string {
  return String(path ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

/** 路径的最后一段，两种写法都适用。 */
export function basename(path: unknown): string {
  const parts = slashPath(path).split('/').filter((part) => part !== '')
  const last = parts[parts.length - 1]
  return last === undefined ? String(path ?? '') : last
}

/**
 * 按引用语法的尾斜杠约定拼出的引用串：目录以 `/` 结尾，文件不带。反斜杠折成
 * `/`，因为这条引用是以文本形式进入草稿的。
 */
export function referenceOf(path: unknown, directory: boolean): string {
  const text = slashPath(path)
  return directory ? text + '/' : text
}

/** 把已拼好的引用包成输入框插入时用的 `@` 词条。 */
export function atToken(reference: string): string {
  if (reference === '' || /["\u0000-\u001f]/.test(reference)) return ''
  return /\s/.test(reference) ? '@"' + reference + '"' : '@' + reference
}

/** 目录路径转成 `@` 词条；路径无法表达时返回 null。 */
function formatMention(path: string): string | null {
  const token = atToken(referenceOf(path, true))
  return token === '' ? null : token
}

export function insertMention(inputActions: InputActions, path: string): boolean {
  const token = formatMention(path)
  if (token === null) return false

  /* 草稿在异步插入前可能已经变了（`insertText` 会拒绝过期的 span），
     所以重新取一次选择区重试，而不是向用户抛一个失败。 */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const span = inputActions.captureInsertion()
    /* 光标在行首时不能前置空格，否则会凭空多出一个空行；在中间时则需要，
       因为 `@` 只在行首或空白之后才成其为引用。 */
    const prefix = span.start > 0 ? ' ' : ''
    if (inputActions.insertText(prefix + token + ' ', span)) return true
  }
  return false
}
