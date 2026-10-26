/** 每个会话一个 store：输入框下方条展示的就是该会话的工作区。 */
import { call, sessionPayload } from '../core/api.js'
import { createStore, type Store } from '../core/store.js'
import type { StateValue, WorkspaceHint } from '../core/types.js'

const stores = new Map<string, Store>()

export function dockStoreFor(sessionId: unknown, hint: WorkspaceHint = () => ''): Store {
  const key = String(sessionId ?? '')
  let store = stores.get(key)
  if (store === undefined) {
    /* 线索按请求读取，不在创建时读一次：第一次应答可能
       在 Client 的会话目录加载完成之前就返回，而那之后的重试
       必须能用上它。 */
    store = createStore(
      () => call<StateValue>('state', sessionPayload(key, hint)),
      { requireWorkspace: true },
    )
    stores.set(key, store)
  }
  return store
}
