/** 管理面板的 store：所有工作区，不带会话上下文。 */
import { call } from '../core/api.js'
import { createStore } from '../core/store.js'
import type { StateValue } from '../core/types.js'

export const panelStore = createStore(() => call<StateValue>('state', {}))
