/** 面板的 store：当前仓库 + 它名下的 worktree。 */
import { call } from '../core/api.js'
import { createStore } from '../core/store.js'
import type { StateValue } from '../core/types.js'

export const panelStore = createStore<StateValue>(() => call<StateValue>('state', {}))
