/**
 * 新会话页里的场景选择器（`conversation.hero.options`）。
 *
 * 位置由宿主给的契约决定：它是「新会话那一行里、工作区与预设控件右侧」的紧凑选项，
 * 所以这里只放一个小下拉，不占地、不解释 —— 详细内容在工具中心「场景」页。
 *
 * ⚠️ 刻意**不用原生 `<select>`**：它展开的候选列表由系统绘制在页面之外的弹出层里，
 * 我们的样式与宿主的深色主题都管不到，于是深色界面下会出现「白底浅灰字」。这里自绘列表，
 * 颜色全部走宿主 token（见 `styles.ts` 的 `.dsk-scene-pick*`）。
 */
import type { ReactNode } from 'react'
import { pickerLabel, useScenePicker } from '../../lib/scenes/use-scene-picker.ts'
import { tNow } from '../../i18n/index.ts'

interface HeroProps {
  sessionId?: unknown
}

export function SceneHeroOption(props: HeroProps): ReactNode {
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const picker = useScenePicker(sessionId)

  // 没有会话、没有场景时都不显示：与其摆一个按不动的控件，不如不占那一行。
  if (!picker.visible) return null

  return (
    <div className='dsk-scene-pick'>
      <button
        type='button'
        className='dsk-scene-pick-btn'
        disabled={picker.saving}
        title={tNow('scenes.heroLabel')}
        aria-haspopup='listbox'
        aria-expanded={picker.open}
        onClick={picker.toggle}
      >
        <span className='dsk-scene-pick-label'>{tNow('scenes.heroLabel')}</span>
        <span className='dsk-scene-pick-value'>{pickerLabel(picker.value)}</span>
        <span className='dsk-scene-pick-caret' aria-hidden='true'>▼</span>
      </button>

      {picker.open
        ? (
          <div className='dsk-scene-pick-list' role='listbox'>
            {picker.options.map((option) => (
              <button
                type='button'
                key={option.value === '' ? '__follow__' : option.value}
                className='dsk-scene-pick-item'
                role='option'
                aria-selected={option.value === picker.value}
                data-current={option.value === picker.value}
                onClick={() => picker.choose(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )
        : null}
    </div>
  )
}
