/**
 * 新会话页那个小小的场景选择器（`conversation.hero.options`）的逻辑。
 *
 * 三个可选值正好对应三层语义：跟随工作区（默认，不写会话记录）、不使用（写 `scene: null`，
 * 压过工作区默认）、某个场景（写场景名）。工作区由服务端按 `sessionId` 反查，客户端不碰。
 *
 * 这个组件由宿主渲染、不经过本插件的页签外壳，拿不到 `props.t`，所以文案走模块级词典
 * （`tNow`）。
 */
import { useEffect, useState } from 'react'
import { callOp } from '../core/api.ts'
import { tNow } from '../../i18n/index.ts'
import type { ScenesStateView } from '../core/types.ts'

/** 值：'' = 跟随工作区；'__none__' = 不使用；其它 = 场景名。 */
export const NONE = '__none__'

export interface PickerOption {
  value: string
  label: string
}

export interface ScenePickerController {
  /** 没有会话、也没有场景时不显示：与其摆一个按不动的控件，不如不占那一行。 */
  visible: boolean
  value: string
  options: PickerOption[]
  open: boolean
  saving: boolean
  toggle(): void
  close(): void
  choose(next: string): void
}

export function useScenePicker(sessionId: string): ScenePickerController {
  const [state, setState] = useState<ScenesStateView | null>(null)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void callOp<ScenesStateView>('scene-state', {})
      .then((next) => { if (alive) setState(next) })
      .catch(() => { if (alive) setState(null) })
    return () => { alive = false }
  }, [sessionId])

  // 点别处 / 按 Esc 收起：自绘列表没有原生 select 的那套行为，得自己管。
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as { closest?: (selector: string) => unknown } | null
      if (typeof target?.closest !== 'function') return
      if (target.closest('.dsk-scene-pick') === null) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const scenes = state?.scenes ?? []
  const choice = state?.sessions?.[sessionId]
  const value = choice === undefined ? '' : (choice.scene === null ? NONE : choice.scene)

  const choose = (next: string): void => {
    setOpen(false)
    if (next === value) return
    setSaving(true)
    /*
     * `carryOver: true`：这个控件的会话 id 只是 New-Session 页的草稿（宿主在真正发送时
     * 才建对话），所以服务端额外记一条「本工作区的下一场会话」；等真有会话开始读技能时
     * 再认领。没有它，这里选了也会静静地不生效。
     */
    const args: Record<string, unknown> = { sessionId, carryOver: true }
    if (next === '') delete args.scene          // 跟随工作区：删掉会话记录
    else if (next === NONE) args.scene = null   // 明确不用
    else args.scene = next
    void callOp('scene-session', args)
      .then(() => callOp<ScenesStateView>('scene-state', {}))
      .then((fresh) => setState(fresh))
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return {
    visible: sessionId !== '' && scenes.length > 0,
    value,
    options: [
      { value: '', label: tNow('scenes.heroFollow') },
      { value: NONE, label: tNow('scenes.heroNone') },
      ...scenes.map((scene) => ({ value: scene.name, label: scene.name })),
    ],
    open,
    saving,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    choose,
  }
}

/** 当前值对应的显示文案。 */
export function pickerLabel(value: string): string {
  if (value === '') return tNow('scenes.heroFollow')
  if (value === NONE) return tNow('scenes.heroNone')
  return value
}
