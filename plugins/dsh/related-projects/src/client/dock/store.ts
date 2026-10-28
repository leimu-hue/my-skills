/** 每个会话一个 store：输入框下方条展示的就是该会话的工作区。 */
import { call, sessionPayload } from '../core/api.js'
import { createStore, type Store } from '../core/store.js'
import type { StateValue } from '../core/types.js'

const stores = new Map<string, Store>()

export function dockStoreFor(sessionId: string): Store {
  let store = stores.get(sessionId)
  if (store === undefined) {
    store = createStore(
      () => call<StateValue>('state', sessionPayload(sessionId)),
      { requireWorkspace: true },
    )
    stores.set(sessionId, store)
  }
  return store
}
