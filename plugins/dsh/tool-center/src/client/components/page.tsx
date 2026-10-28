/**
 * 工具中心的页签外壳：场景 / MCP / 技能 / 提示词。
 *
 * 外壳只做三件事：记住当前页签、提供一条统一的 toast、把 `t` 与 `notify` 交给各域视图。
 * 每个域自己读自己的数据、自己写自己的 op —— 一个域挂了不影响别的域。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { tNow, type Translate } from '../i18n/index.ts'
import { readText, writeText } from '../lib/core/storage.ts'
import { SkillsView } from './skills/view.tsx'
import { PromptsView } from './prompts/view.tsx'
import { McpView } from './mcp/view.tsx'
import { ScenesView } from './scenes/view.tsx'

const TABS = ['scenes', 'mcp', 'skills', 'prompts'] as const
type TabKey = typeof TABS[number]
const TAB_KEY = 'tool-center:tab'

function isTabKey(value: string): value is TabKey {
  return (TABS as readonly string[]).includes(value)
}

export function ToolCenterPage(props: Record<string, unknown>): ReactNode {
  const fromProps = props.t
  /* 槽位给了 `t` 就用它（宿主词典）；没给就退回本模块自己的词典，面板仍然能取词。 */
  const t: Translate = typeof fromProps === 'function'
    ? fromProps as Translate
    : (key, values) => tNow(key, values)
  const [tab, setTab] = useState<TabKey>('skills')
  const [toast, setToast] = useState('')

  const notify = (message: string): void => {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? '' : current)), 2800)
  }

  useEffect(() => {
    // 记住上次看的页签，切回面板时不用重新找。
    const saved = readText(TAB_KEY)
    if (saved !== null && isTabKey(saved)) setTab(saved)
  }, [])

  const select = (next: TabKey): void => {
    setTab(next)
    writeText(TAB_KEY, next)
  }

  return (
    <div className='dsk-root'>
      <div className='dsk-tabs' role='tablist'>
        {TABS.map((key) => (
          <button
            type='button'
            key={key}
            role='tab'
            className='dsk-tab'
            data-active={String(tab === key)}
            aria-selected={tab === key}
            onClick={() => select(key)}
          >
            {t('tab.' + key)}
          </button>
        ))}
      </div>
      <div key={tab} role='tabpanel' aria-label={t('tab.' + tab)}>
        {tab === 'scenes'
          ? <ScenesView t={t} notify={notify} />
          : tab === 'mcp'
            ? <McpView t={t} notify={notify} />
            : tab === 'prompts'
              ? <PromptsView t={t} notify={notify} />
              : <SkillsView t={t} notify={notify} />}
      </div>
      {toast === '' ? null : <div className='dsk-toast' role='status' aria-live='polite'>{toast}</div>}
    </div>
  )
}
