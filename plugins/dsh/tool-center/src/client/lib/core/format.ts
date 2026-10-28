/**
 * 时间与数字的显示。
 *
 * 一律走 `Intl`：写死的 `YYYY/MM/DD hh:mm` 在别的语言环境下是错的。选项是显式列出来的，
 * 不用 `dateStyle` / `timeStyle`（那两个要 `lib: ES2021`，而浏览器半侧还停在 ES2020）。
 */
const WHEN = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** 毫秒时间戳 → 本地化的「日期 + 时分」。 */
export function formatWhen(ms: number): string {
  return WHEN.format(new Date(ms))
}
