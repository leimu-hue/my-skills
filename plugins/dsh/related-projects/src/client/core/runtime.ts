/**
 * React 来自 Host 的模块表，而不是打进 bundle：加载器把 `require` 交给插件。
 * 组件统一通过这个访问器里的 `h()` 创建元素，于是 bundle 既不需要
 * JSX 运行时，也不需要自带一份 React。
 */
type AnyComponent = unknown
type CreateElement = (type: AnyComponent, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown

interface ReactLike {
  createElement: CreateElement
  useEffect(fn: () => void | (() => void), deps?: unknown[]): void
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]
  useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, get: () => T, getServer?: () => T): T
}

let react: ReactLike | null = null

export function setReact(value: ReactLike): void {
  react = value
}

export function useReact(): ReactLike {
  if (react === null) throw new Error('related-projects: React was not provided by the module loader')
  return react
}

/** 把 `createElement` 收在一处：组件因此都不必 import React。 */
export const h: CreateElement = (type, props, ...children) => useReact().createElement(type, props, ...children)
