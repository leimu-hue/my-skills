/**
 * React 来自宿主的模块表，而不是这个 bundle：加载器把 `require` 交给插件。组件统一通过
 * 这个访问器里的 `h()` 创建元素，于是 bundle 既不需要 JSX 运行时，也不需要自带一份 React。
 */
type AnyComponent = unknown
type CreateElement = (type: AnyComponent, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown

export interface ReactLike {
  createElement: CreateElement
  useEffect(fn: () => void | (() => void), deps?: unknown[]): void
  useMemo<T>(factory: () => T, deps?: unknown[]): T
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]
  useCallback<T>(fn: T, deps?: unknown[]): T
  useRef<T>(initial: T): { current: T }
  Fragment: AnyComponent
}

let react: ReactLike | null = null

export function setReact(value: ReactLike): void {
  react = value
}

export function useReact(): ReactLike {
  if (react === null) throw new Error('tool-center: React was not provided by the module loader')
  return react
}

export const h: CreateElement = (type, props, ...children) => useReact().createElement(type, props, ...children)

/** 带依赖数组的 `useEffect`，出于同样原因类型放宽。 */
export function useClientEffect(fn: () => void | (() => void), deps: unknown[]): void {
  useReact().useEffect(fn, deps)
}

export function useStateOf<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  return useReact().useState<T>(initial)
}
