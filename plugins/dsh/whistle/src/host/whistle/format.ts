/**
 * 把 whistle 的数据压成模型好读的文本。
 *
 * 抓包数据的形状按协议、版本、请求体大小变化很大，所以这里每个取值都走
 * 「尽力而为」：拿不到就显示 `-`，绝不因为一个缺失字段让整次查询失败。
 * `utils.*` 由 whistle 提供，但老版本可能缺方法，因此都包在 try 里。
 */
import type { WhistleApi, WhistleFrame, WhistleHeaders, WhistleSession } from './types.ts'

export const DEFAULT_BODY_LIMIT = 4000

const COLUMNS = { id: 20, time: 8, method: 6, status: 3, size: 7, took: 8 }

export function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function truncate(text: string, limit: number): string {
  if (limit <= 0 || text.length <= limit) return text
  return text.slice(0, limit) + '\n… (' + (text.length - limit) + ' more chars, raise the limit to see them)'
}

/** 本地时间 `HH:MM:SS`；抓包只关心一天内的相对位置。 */
export function clockOf(time: number | undefined): string {
  if (typeof time !== 'number' || !Number.isFinite(time)) return '-'
  const date = new Date(time)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function sizeText(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K'
  return (bytes / 1024 / 1024).toFixed(1) + 'M'
}

/** 总耗时（毫秒）；`utils.getTimings` 缺失时返回 null，而不是 0。 */
export function durationOf(api: WhistleApi, session: WhistleSession): number | null {
  try {
    const timings = api.utils.getTimings(session)
    const total = timings?.total
    return typeof total === 'number' && Number.isFinite(total) ? total : null
  } catch {
    return null
  }
}

/** 请求或响应正文：优先用 whistle 的解码器，退回到手写 base64 解码。 */
export function bodyOf(api: WhistleApi, session: WhistleSession, side: 'req' | 'res'): string {
  try {
    const text = side === 'req' ? api.utils.getReqBody(session) : api.utils.getResBody(session)
    if (typeof text === 'string') return text
  } catch {
    /* 落到下面的 base64 兜底 */
  }
  const message = side === 'req' ? session.req : session.res
  const base64 = message?.base64
  if (typeof base64 !== 'string' || base64 === '') return ''
  try {
    return Buffer.from(base64, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export function headerLines(headers: WhistleHeaders | undefined): string[] {
  if (headers === undefined || headers === null) return []
  return Object.keys(headers).map((name) => {
    const value = headers[name]
    const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
    return name + ': ' + text
  })
}

/** 看起来像 JSON 就顺便美化——这是模型读响应时最常做的事。 */
export function prettyBody(text: string, limit: number): string {
  const trimmed = text.trim()
  if (trimmed === '') return '(empty)'
  if (/^\s*[[{]/.test(trimmed)) {
    try {
      return truncate(JSON.stringify(JSON.parse(trimmed), null, 2), limit)
    } catch {
      /* 不是合法 JSON，按原文返回 */
    }
  }
  return truncate(text, limit)
}

export function sessionTableHeader(): string {
  return [
    'id'.padEnd(COLUMNS.id),
    'time'.padEnd(COLUMNS.time),
    'method'.padEnd(COLUMNS.method),
    'code'.padStart(COLUMNS.status),
    'size'.padStart(COLUMNS.size),
    'took'.padStart(COLUMNS.took),
    'url',
  ].join('  ')
}

/** 一行一条记录：固定列宽，让扫一眼就能对齐比较。 */
export function sessionLine(api: WhistleApi, session: WhistleSession): string {
  const method = (session.req?.method ?? session.method ?? '-').toUpperCase()
  const status = typeof session.res?.statusCode === 'number' ? String(session.res.statusCode) : '-'
  const total = durationOf(api, session)
  return [
    String(session.id ?? '-').padEnd(COLUMNS.id),
    clockOf(session.startTime).padEnd(COLUMNS.time),
    method.padEnd(COLUMNS.method),
    status.padStart(COLUMNS.status),
    sizeText(session.res?.size).padStart(COLUMNS.size),
    (total === null ? '-' : total + 'ms').padStart(COLUMNS.took),
    String(session.url ?? ''),
  ].join('  ')
}

export function frameBody(api: WhistleApi, frame: WhistleFrame): string {
  try {
    const text = api.utils.getText(frame)
    if (typeof text === 'string') return text
  } catch {
    /* 落到下面的 base64 兜底 */
  }
  const base64 = frame.base64
  if (typeof base64 !== 'string' || base64 === '') return ''
  try {
    return Buffer.from(base64, 'base64').toString('utf8')
  } catch {
    return ''
  }
}

/** 帧方向。不同 whistle 版本用不同字段表达，任一命中即判定。 */
export function frameDirection(frame: WhistleFrame): string {
  if (frame.fromClient === true || frame.isClient === true || frame.from === 'client') return 'C>S'
  if (frame.fromClient === false || frame.isClient === false || frame.from === 'server') return 'S>C'
  return '-'
}

export function frameTableHeader(): string {
  return ['frameId'.padEnd(COLUMNS.id), 'dir', 'op', 'size'.padStart(COLUMNS.size), 'body'].join('  ')
}

export function frameLine(api: WhistleApi, frame: WhistleFrame, limit = 240): string {
  const body = frameBody(api, frame).replace(/\r?\n/g, '\\n')
  return [
    String(frame.frameId ?? '-').padEnd(COLUMNS.id),
    frameDirection(frame),
    String(frame.opcode ?? '-').padStart(2),
    sizeText(frame.length).padStart(COLUMNS.size),
    truncate(body, limit),
  ].join('  ')
}

/** 规则文件的预览行：只给人/模型判断「这条要不要看」用。 */
export function rulePreview(value: string, limit = 60): string {
  const lines = value.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return '(empty)'
  const first = lines[0].trim()
  /* 预览要单行：`truncate` 的续行提示会把表格撑乱。 */
  const head = first.length > limit ? first.slice(0, limit) + '…' : first
  return head + (lines.length > 1 ? '  … ' + lines.length + ' lines' : '')
}
