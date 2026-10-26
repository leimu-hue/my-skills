/**
 * 一个域视图的公共外壳：读一次自己的数据、写自己的 op、把错误与「忙」集中管理。
 *
 * 三个域（提示词 / MCP / 场景）原本各写一份同样的 `load` + `act` + `busy` + `error`；
 * 技能域还多一份自己的 toast。这里把它们收成一个 hook：`useDomain(op)` 给 state /
 * busy / error / reload / act，提示语由调用方给（可以是字符串，也可以按回执拼一句）。
 */
import { callOp, describeCause, type OpError } from './api.js'
import { useClientEffect, useStateOf } from './runtime.js'
import type { Translate } from '../i18n/index.js'

/** 每个域视图从页签外壳拿到的两样东西。 */
export interface DomainProps {
  t: Translate
  notify: (message: string) => void
}

/** 一次写 op 的结果：成功时带上回执里的 data，供需要的调用方取用。 */
interface ActOutcome { ok: boolean; result?: unknown }

/** 一次失败：给人看的句子 +（可选）可翻译的错误码。 */
export interface DomainFailure {
  message: string
  code?: string
}

/** 提示语：固定一句，或按 op 回执拼一句（例如带上后端警告 / 被换掉的那份预设）。 */
export type Notice = string | ((result: unknown) => string)

export interface Domain<T> {
  state: T | null
  busy: string
  error: DomainFailure | null
  /** 重新读一次（`silent` 时不点亮 busy，用于变更后的静默刷新）。 */
  reload(options?: { silent?: boolean }): Promise<T | null>
  /** 跑一个写 op：成功后静默刷新并提示；失败则把错误摆到页面上。 */
  act(op: string, args: Record<string, unknown>, notice?: Notice): Promise<ActOutcome>
  /** 手动设一条错误（例如前端校验失败）。 */
  fail(message: string): void
}

function failureOf(cause: unknown): DomainFailure {
  const candidate = cause as OpError
  return { message: describeCause(cause), code: typeof candidate?.code === 'string' ? candidate.code : undefined }
}

export function useDomain<T>(op: string, notify: (message: string) => void): Domain<T> {
  const [state, setState] = useStateOf<T | null>(null)
  const [busy, setBusy] = useStateOf('')
  const [error, setError] = useStateOf<DomainFailure | null>(null)

  const reload = async (options: { silent?: boolean } = {}): Promise<T | null> => {
    if (options.silent !== true) setBusy(op)
    try {
      const next = await callOp<T>(op, {})
      setState(next)
      setError(null)
      return next
    } catch (cause) {
      setError(failureOf(cause))
      return null
    } finally {
      if (options.silent !== true) setBusy('')
    }
  }

  useClientEffect(() => {
    void reload()
  }, [])

  const act = async (action: string, args: Record<string, unknown>, notice?: Notice): Promise<ActOutcome> => {
    setBusy(action)
    setError(null)
    try {
      const result = await callOp(action, args)
      await reload({ silent: true })
      const message = typeof notice === 'function' ? notice(result) : (notice ?? '')
      if (message !== '') notify(message)
      return { ok: true, result }
    } catch (cause) {
      setError(failureOf(cause))
      return { ok: false }
    } finally {
      setBusy('')
    }
  }

  const fail = (message: string): void => setError({ message })

  return { state, busy, error, reload, act, fail }
}

/** 把后端的 warnings 拼到提示语后面（场景 / 提示词域用）。 */
export function noticeWithWarnings(message: string, result: unknown): string {
  const warnings = (result as { warnings?: unknown } | null)?.warnings
  if (!Array.isArray(warnings) || warnings.length === 0) return message
  return `${message} · ${warnings.join(' · ')}`
}
