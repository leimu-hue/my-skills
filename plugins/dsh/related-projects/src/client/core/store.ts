/**
 * 客户端缓存：每个视图一份共享快照，变更后显式刷新。刻意做得笨——真相归
 * Host，这里只是免得每次渲染都重新取数。
 *
 * 这里唯一需要判断的地方：会话级视图的工作区 Host 还没解析出来时，那不算
 * 最终答案。这种情形出现在旧会话的 resume 尚未结束、而它的输入框已经渲染
 * 的时候，于是 store 按有上限的退避继续追问，而不是把 "no workspace" 缓存
 * 到页面整个生命周期。
 */
import { useSyncExternalStore } from 'react'
import type { StateValue } from './types.js'

export interface Snapshot {
  status: 'idle' | 'ready' | 'error'
  data: StateValue | null
  error: unknown
}

export interface Store {
  subscribe(listener: () => void): () => void
  get(): Snapshot
  refresh(force?: boolean): Promise<StateValue | null>
}

export interface StoreOptions {
  /** 会话级视图应设为 true：它的工作区此时可能还解析不出来。 */
  requireWorkspace?: boolean
}

/**
 * 针对「Host 还没解析出这个会话的工作区」的退避。刻意有上限：永远解析不
 * 出来的会话（已归档、属于别处、或被 Host 拒绝）不能整页轮询。一分钟的
 * 耐心足够覆盖任何真实的 resume；焦点或可见性变化本来就会再问一次。
 */
const WORKSPACE_RETRY_MS = [120, 250, 500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 15000]

/** 本 bundle 创建过的所有 store，这样一次变更就能让所有视图失效。 */
const stores = new Set<Store>()

export function createStore(load: () => Promise<StateValue>, options: StoreOptions = {}): Store {
  const requireWorkspace = options.requireWorkspace === true
  let snapshot: Snapshot = { status: 'idle', data: null, error: null }
  const listeners = new Set<() => void>()
  let inflight: Promise<StateValue | null> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let retries = 0
  /** 每次刷新自增：最新的请求才拥有快照和 `inflight`。 */
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

  const cancelRetry = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  /* 只有会话级视图会处于这个状态，且只在 Host 还在查这个会话落在哪里的时候。 */
  const scheduleRetry = (data: StateValue): void => {
    if (!requireWorkspace || data.workspace !== null) {
      retries = 0
      cancelRetry()
      return
    }
    if (retries >= WORKSPACE_RETRY_MS.length) return
    const delay = WORKSPACE_RETRY_MS[retries]
    retries += 1
    cancelRetry()
    timer = setTimeout(() => {
      timer = null
      void refresh(true)
    }, delay)
  }

  function refresh(force?: boolean): Promise<StateValue | null> {
    if (inflight !== null && force !== true) return inflight
    /* `ready` 快照就是最终答案——唯独会话级视图的工作区解析不出来时例外
       （还在启动，或刚重载）。那份答案必须保持可重试，不能被缓存到页面整个
       生命周期。不需要工作区的视图不受此限，否则每个调用方都会触发取数。 */
    const settled = snapshot.status === 'ready'
      && snapshot.data !== null
      && (!requireWorkspace || snapshot.data.workspace !== null)
    if (settled && force !== true) return Promise.resolve(snapshot.data)
    /* 强制刷新可能与进行中的请求重叠（工作区重试定时器正是如此）。只有最新的
       请求可以写快照或清空 `inflight`，否则慢的旧答案会盖掉新答案，还会让第三次
       取数在调用方背后冒出来。 */
    const generation = ++latest
    inflight = load()
      .then((data) => {
        if (generation !== latest) return snapshot.data
        snapshot = { status: 'ready', data, error: null }
        emit()
        scheduleRetry(data)
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

  const store: Store = {
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
  stores.add(store)
  return store
}

/**
 * 变更后重读所有视图：面板改动了登记表，所以面板本身和每个已挂载的输入框行
 * 都已过期。由持有 `busy` 标志的调用方 await，这样 UI 不会在自己的数据到达前
 * 就先落定。
 */
export async function refreshStores(): Promise<void> {
  await Promise.all(Array.from(stores).map((store) => store.refresh(true)))
}

export function useSnapshot(store: Store): Snapshot {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
