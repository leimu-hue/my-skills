/**
 * React arrives from the host's module table, not a bundle: the loader hands the
 * plugin a `require`. Components are written with `h()` through this accessor so
 * the bundle never needs a JSX runtime or a copy of React.
 */
type AnyComponent = unknown
type CreateElement = (type: AnyComponent, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown

interface ReactLike {
  createElement: CreateElement
  useEffect(fn: () => void | (() => void), deps?: unknown[]): void
  useMemo<T>(factory: () => T, deps?: unknown[]): T
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]
  useCallback<T>(fn: T, deps?: unknown[]): T
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

/** `createElement` in one place: keeps every component free of a React import. */
export const h: CreateElement = (type, props, ...children) => useReact().createElement(type, props, ...children)
