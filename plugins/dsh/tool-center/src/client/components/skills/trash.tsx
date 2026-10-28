/** 回收站面板：恢复 / 永久删除 / 清空。 */
import type { ReactNode } from 'react'
import type { Translate } from '../../i18n/index.ts'
import type { TrashItem } from '../../lib/core/types.ts'
import { emptyOf } from '../ui/atoms.tsx'
import { buttonOf, modalOf } from '../ui/controls.tsx'

export interface TrashHandlers {
  items: TrashItem[]
  busy: string
  onClose(): void
  onRestore(item: TrashItem): void
  onPurge(item: TrashItem): void
  onEmpty(): void
}

export function renderTrash(t: Translate, props: TrashHandlers): ReactNode {
  const disabled = props.busy !== ''
  return modalOf(
    t('trash.title'),
    props.items.length === 0
      ? [emptyOf(t('trash.empty'))]
      : props.items.map((item) => (
        <div className='dsk-trash-item' key={item.id}>
          <div>
            <div className='dsk-row-name'>{item.declaredName}</div>
            <div className='dsk-trash-meta'>
              {`${item.rootLabel} · ${t('trash.deletedAt', { time: new Date(item.deletedAt).toLocaleString() })}`}
            </div>
            <div className='dsk-trash-meta'>{item.originalPath}</div>
          </div>
          <div className='dsk-trash-actions'>
            {buttonOf({ label: t('trash.restore'), small: true, disabled, onClick: () => props.onRestore(item) })}
            {buttonOf({ label: t('trash.purge'), small: true, variant: 'danger', disabled, onClick: () => props.onPurge(item) })}
          </div>
        </div>
      )),
    [
      props.items.length > 0
        ? buttonOf({ label: t('trash.emptyAll'), variant: 'danger', disabled, onClick: props.onEmpty })
        : null,
      buttonOf({ label: t('detail.close'), onClick: props.onClose }),
    ],
  )
}
