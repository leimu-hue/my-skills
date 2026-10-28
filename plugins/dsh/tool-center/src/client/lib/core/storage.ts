/**
 * 本机的界面偏好：页签、来源折叠。
 *
 * 这些不是策略、也不是数据 —— 换台机器不该跟着走，所以只写 `localStorage`，永不进
 * `state.json`。读坏 / 写不进去都当作「这次没记住」，绝不抛给调用方。
 */

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as T
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 记不住也不影响本次会话 */
  }
}

export function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeText(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 记不住也不影响使用 */
  }
}
