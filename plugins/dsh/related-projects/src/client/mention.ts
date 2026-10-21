/**
 * Turning a directory path into an `@` reference in the composer.
 *
 * The mention grammar requires the `@` to start a line or follow whitespace, and
 * an absolute host path never appears in the completion menu (that menu is
 * bounded by the session cwd), so the token is inserted as plain text and the
 * model reads it as an explicit reference.
 */
export interface InputActions {
  captureInsertion?(): { start: number; end: number; draftRev: number } | null | undefined
  insertText?(text: string, span: { start: number; end: number; draftRev: number }): boolean
}

/** A path as an `@` token: absolute, forward slashes, trailing slash for a directory. */
export function formatMention(path: string): string | null {
  const text = String(path).replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  if (/["\u0000-\u001f]/.test(text)) return null
  return /\s/.test(text) ? '@"' + text + '"' : '@' + text
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
    /* Without subscribing to the draft we cannot tell whether the caret already
       follows whitespace; a leading space is harmless when it does and required
       when it does not. */
    const prefix = span.start > 0 ? ' ' : ''
    if (insert(prefix + token + ' ', span) === true) return true
  }
  return false
}
