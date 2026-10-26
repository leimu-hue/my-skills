/**
 * 路径写法与 `@` 引用语法——凡是要用其中之一的都共用同一份实现（菜单行、
 * 输入框行的插入、面板标题）。
 *
 * 引用语法要求 `@` 位于行首或紧跟空白，而绝对的 Host 路径从不出现在补全菜单里
 * （那个菜单以会话 cwd 为界），所以词条以纯文本插入，模型读到的就是一条显式
 * 引用。
 */

export interface InputActions {
  captureInsertion?(): { start: number; end: number; draftRev: number } | null | undefined
  insertText?(text: string, span: { start: number; end: number; draftRev: number }): boolean
}

/** 用 `/` 书写的路径，不带尾部斜杠。 */
export function slashPath(path: unknown): string {
  return String(path ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

/** 路径的最后一段，两种写法都适用。 */
export function basename(path: unknown): string {
  const parts = slashPath(path).split('/').filter((part) => part !== '')
  return parts.length === 0 ? String(path ?? '') : parts[parts.length - 1]
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
export function formatMention(path: string): string | null {
  const token = atToken(referenceOf(path, true))
  return token === '' ? null : token
}

export function insertMention(inputActions: InputActions | undefined, path: string): boolean {
  if (inputActions === undefined || inputActions === null) return false
  const capture = inputActions.captureInsertion
  const insert = inputActions.insertText
  if (typeof capture !== 'function' || typeof insert !== 'function') return false
  const token = formatMention(path)
  if (token === null) return false

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const span = capture()
    if (span === undefined || span === null) return false
    /* 不订阅草稿就无法判断光标前是否已有空白；有空白时前置空格无害，没有时
       则必需。 */
    const prefix = span.start > 0 ? ' ' : ''
    if (insert(prefix + token + ' ', span) === true) return true
  }
  return false
}
