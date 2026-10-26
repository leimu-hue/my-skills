/** 回收站面板：恢复 / 永久删除 / 清空。 */
import { h } from '../core/runtime.js'
import type { Translate } from '../i18n/index.js'
import type { TrashItem } from '../core/types.js'
import { buttonOf, emptyOf, modalOf } from '../core/ui.js'

export interface TrashHandlers {
  items: TrashItem[]
  busy: string
  onClose(): void
  onRestore(item: TrashItem): void
  onPurge(item: TrashItem): void
  onEmpty(): void
}

export function renderTrash(t: Translate, props: TrashHandlers): unknown {
  const disabled = props.busy !== ''
  return modalOf(
    t('trash.title'),
    props.items.length === 0
      ? [emptyOf(t('trash.empty'))]
      : props.items.map((item) => h('div', { className: 'dsk-trash-item', key: item.id },
        h('div', null,
          h('div', { className: 'dsk-row-name' }, item.declaredName),
          h('div', { className: 'dsk-trash-meta' },
            `${item.rootLabel} · ${t('trash.deletedAt', { time: new Date(item.deletedAt).toLocaleString() })}`),
          h('div', { className: 'dsk-trash-meta' }, item.originalPath)),
        h('div', { className: 'dsk-trash-actions' },
          buttonOf({ label: t('trash.restore'), small: true, disabled, onClick: () => props.onRestore(item) }),
          buttonOf({ label: t('trash.purge'), small: true, variant: 'danger', disabled, onClick: () => props.onPurge(item) })))),
    [
      props.items.length > 0
        ? buttonOf({ label: t('trash.emptyAll'), variant: 'danger', disabled, onClick: props.onEmpty })
        : null,
      buttonOf({ label: t('detail.close'), onClick: props.onClose }),
    ],
  )
}
