/**
 * 客户端缓存：一份共享快照，变更后显式刷新。刻意做得笨——真相归 Host，
 * 这里只是免得每次渲染都重新取数。
 */
import { useSyncExternalStore } from 'react'

export interface Snapshot<T> {
  status: 'idle' | 'ready' | 'error'
  data: T | null
  error: unknown
}

export interface Store<T> {
  subscribe(listener: () => void): () => void
  get(): Snapshot<T>
  refresh(force?: boolean): Promise<T | null>
}

/** 本 bundle 创建过的所有 store，这样一次变更就能让所有视图失效。 */
const stores = new Set<Store<unknown>>()

export function createStore<T>(load: () => Promise<T>): Store<T> {
  let snapshot: Snapshot<T> = { status: 'idle', data: null, error: null }
  const listeners = new Set<() => void>()
  let inflight: Promise<T | null> | null = null
  let latest = 0

  const emit = (): void => {
    for (const listener of Array.from(listeners)) {
      try {
        listener()
      } catch {
        /* 一个订阅者坏了不能拖住其余的订阅者 */
      }
    }
  }

  function refresh(force?: boolean): Promise<T | null> {
    if (inflight !== null && force !== true) return inflight
    if (snapshot.status === 'ready' && snapshot.data !== null && force !== true) {
      return Promise.resolve(snapshot.data)
    }
    /* 强制刷新可能与进行中的请求重叠：只有最新的请求可以写快照。 */
    const generation = ++latest
    inflight = load()
      .then((data) => {
        if (generation !== latest) return snapshot.data
        snapshot = { status: 'ready', data, error: null }
        emit()
        return data
      })
      .catch((error: unknown) => {
        if (generation !== latest) return snapshot.data
        snapshot = { status: 'error', data: snapshot.data, error }
        emit()
        return null
      })
      .then((value) => {
        if (generation === latest) inflight = null
        return value
      })
    return inflight
  }

  const store: Store<T> = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get() {
      return snapshot
    },
    refresh,
  }
  stores.add(store as Store<unknown>)
  return store
}

/** 变更后重读所有视图：面板改动了登记表，所以每个已挂载的面板都已过期。 */
export async function refreshStores(): Promise<void> {
  await Promise.all(Array.from(stores).map((store) => store.refresh(true)))
}

export function useSnapshot<T>(store: Store<T>): Snapshot<T> {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
