/**
 * 新会话页里的场景选择器（`conversation.hero.options`）。
 *
 * 位置由宿主给的契约决定：它是「新会话那一行里、工作区与预设控件右侧」的紧凑选项，
 * 所以这里只放一个小下拉，不占地、不解释 —— 详细内容在工具中心「场景」页。
 *
 * 三个可选值正好对应三层语义：
 *   * 跟随工作区（默认，不写会话记录）；
 *   * 不使用（写 `scene: null`，压过工作区默认）；
 *   * 某个场景（写场景名）。
 *
 * 工作区由服务端按 `sessionId` 反查，客户端不碰 —— 拿不到也不该猜。
 *
 * ⚠️ 刻意**不用原生 `<select>`**：它展开的候选列表由系统绘制在页面之外的弹出层里，
 * 我们的样式与宿主的深色主题都管不到，于是深色界面下会出现「白底浅灰字」。这里自绘列表，
 * 颜色全部走宿主 token（见 `styles.ts` 的 `.dsk-scene-pick*`）。
 */
import { callOp } from '../core/api.js'
import { h, useClientEffect, useStateOf } from '../core/runtime.js'
import { tNow } from '../i18n/index.js'
import type { ScenesStateView } from '../core/types.js'

/** 值：'' = 跟随工作区；'__none__' = 不使用；其它 = 场景名。 */
const NONE = '__none__'

interface HeroProps {
  sessionId?: unknown
}

interface Option {
  value: string
  label: string
}

export function SceneHeroOption(props: HeroProps): unknown {
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const [state, setState] = useStateOf<ScenesStateView | null>(null)
  const [saving, setSaving] = useStateOf(false)
  const [open, setOpen] = useStateOf(false)

  useClientEffect(() => {
    let alive = true
    void callOp<ScenesStateView>('scene-state', {})
      .then((next) => { if (alive) setState(next) })
      .catch(() => { if (alive) setState(null) })
    return () => { alive = false }
  }, [sessionId])

  // 点别处 / 按 Esc 收起：自绘列表没有原生 select 的那套行为，得自己管。
  useClientEffect(() => {
    if (!open) return () => undefined
    const onPointerDown = (event: { target?: unknown }): void => {
      const target = event?.target as { closest?: (selector: string) => unknown } | null | undefined
      if (typeof target?.closest !== 'function') return
      if (target.closest('.dsk-scene-pick') === null) setOpen(false)
    }
    const onKeyDown = (event: { key?: unknown }): void => {
      if (event?.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const scenes = state?.scenes ?? []
  // 没有会话、没有场景时都不显示：与其摆一个按不动的控件，不如不占那一行。
  if (sessionId === '' || scenes.length === 0) return null

  const choice = state?.sessions?.[sessionId]
  const value = choice === undefined ? '' : (choice.scene === null ? NONE : choice.scene)
  const labelOf = (next: string): string => {
    if (next === '') return tNow('scenes.heroFollow')
    if (next === NONE) return tNow('scenes.heroNone')
    return next
  }
  const options: Option[] = [
    { value: '', label: tNow('scenes.heroFollow') },
    { value: NONE, label: tNow('scenes.heroNone') },
    ...scenes.map((scene) => ({ value: scene.name, label: scene.name })),
  ]

  const apply = (next: string): void => {
    setOpen(false)
    if (next === value) return
    setSaving(true)
    const args: Record<string, unknown> = { sessionId }
    if (next === '') delete args.scene          // 跟随工作区：删掉会话记录
    else if (next === NONE) args.scene = null   // 明确不用
    else args.scene = next
    void callOp('scene-session', args)
      .then(() => callOp<ScenesStateView>('scene-state', {}))
      .then((fresh) => setState(fresh))
      .catch(() => undefined)
      .finally(() => setSaving(false))
  }

  return h('div', { className: 'dsk-scene-pick' },
    h('button', {
      type: 'button',
      className: 'dsk-scene-pick-btn',
      disabled: saving,
      title: tNow('scenes.heroLabel'),
      'aria-haspopup': 'listbox',
      'aria-expanded': open ? 'true' : 'false',
      onClick: () => setOpen(!open),
    },
    h('span', { className: 'dsk-scene-pick-label' }, tNow('scenes.heroLabel')),
    h('span', { className: 'dsk-scene-pick-value' }, labelOf(value)),
    h('span', { className: 'dsk-scene-pick-caret', 'aria-hidden': 'true' }, '▼')),

    open
      ? h('div', { className: 'dsk-scene-pick-list', role: 'listbox' },
        options.map((option) => h('button', {
          type: 'button',
          key: option.value === '' ? '__follow__' : option.value,
          className: 'dsk-scene-pick-item',
          role: 'option',
          'aria-selected': option.value === value ? 'true' : 'false',
          'data-current': option.value === value ? 'true' : 'false',
          onClick: () => apply(option.value),
        }, option.label)))
      : null)
}
