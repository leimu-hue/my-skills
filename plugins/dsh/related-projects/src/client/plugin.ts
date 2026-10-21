/**
 * Slot wiring. Nothing here renders — each registration points at a component
 * that owns its own data through the stores.
 */
import { CSS } from './styles.js'
import { setReact, h } from './runtime.js'
import { NS, EN, ZH, translate } from './locale.js'
import { DockRow, PanelIcon } from './dock.js'
import { Panel } from './panel.js'
import { sessionWorkspace } from './session.js'
import { dockStoreFor } from './state.js'
import { createTriggerSource, type TriggerSource } from './trigger.js'

export const PANEL_ID = 'related-projects'
const DOCK_ORDER = 60
const ICON_ORDER = 30

interface SlotsLike {
  inject(key: string, callback: () => () => void): () => void
  register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void
}

interface InputTriggersLike {
  registerSource(source: TriggerSource): () => void
}

interface LocaleLike {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
}

export interface PluginContext {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): () => void
  inject?(names: string[], callback: (scoped: PluginContext) => void): unknown
}

export interface Plugin {
  inject: string[]
  apply(ctx: PluginContext): void
}

export function createPlugin(React: unknown): Plugin {
  setReact(React as never)

  return {
    inject: ['slots'],
    apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-related-projects', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() }, 'related-projects: styles')

      const locale = ctx.get('locale') as LocaleLike | undefined
      if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'related-projects: dictionaries')
      }

      /* The `@` source: feeds the official trigger menu, which owns all of the UI.
         `inject` (not a bare get) because the pipeline service may be provided
         after this apply runs; the callback fires when it exists. registerSource
         throws when the same (trigger, name) is already registered — which happens
         on a hot reload while the previous module's effect is still alive — so a
         stale duplicate must not abort the rest of this apply. */
      const mountTrigger = (scoped: PluginContext): void => {
        const triggers = scoped.get('inputTriggers') as InputTriggersLike | undefined
        if (triggers === undefined || triggers === null || typeof triggers.registerSource !== 'function') {
          console.warn('[related-projects] inputTriggers service unavailable; @ menu disabled')
          return
        }
        scoped.effect(() => {
          let dispose = (): void => {}
          try {
            dispose = triggers.registerSource(createTriggerSource(
              (sessionId) => sessionWorkspace(ctx, sessionId),
              (key, values) => translate(ctx, key, values),
            ))
          } catch (error) {
            console.warn('[related-projects] @ source already registered (stale reload)', error)
          }
          return () => { try { dispose() } catch { /* already gone */ } }
        }, 'related-projects: @ source')
      }
      if (typeof ctx.inject === 'function') ctx.inject(['inputTriggers'], mountTrigger)
      else mountTrigger(ctx)

      const slots = ctx.get('slots') as SlotsLike | undefined
      if (slots === undefined || slots === null) return

      /* Composer row: session-scoped, so its workspace comes from the session.
         The per-session store is created in the registration's inject world (the
         documented place for entry-private data), never from the component. */
      ctx.effect(() => slots.inject('conversation.composer.dock', () => slots.register({
        name: 'conversation.composer.dock',
        id: PANEL_ID,
        order: DOCK_ORDER,
        locale: NS,
        inject: (sessionId: string) => ({
          dockStore: dockStoreFor(sessionId, (id) => sessionWorkspace(ctx, id)),
          workspaceHint: (id: unknown) => sessionWorkspace(ctx, id),
        }),
      }, (props) => h(DockRow as never, props))), 'related-projects: composer row')

      /* Left rail icon + the panel it opens (the same id on both slots). */
      ctx.effect(() => slots.inject('sidebar.panellist', () => slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: ICON_ORDER,
        label: () => translateLabel(ctx, 'panel.title'),
      }, PanelIcon as never)), 'related-projects: sidebar icon')

      ctx.effect(() => slots.inject('main', () => slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, (props) => h(Panel as never, props))), 'related-projects: panel')
    },
  }
}

/** Label thunks are re-read on every projection, so they follow the locale. */
function translateLabel(ctx: PluginContext, key: string): string {
  const dict = (): Record<string, string> => {
    try {
      const locale = ctx.get('locale') as { getSnapshot?(): { active?: string } } | undefined
      const active = String(locale?.getSnapshot?.().active ?? '')
      return active.toLowerCase().startsWith('zh') ? ZH : EN
    } catch {
      return EN
    }
  }
  const bag = dict()
  return bag[key] ?? EN[key] ?? key
}
