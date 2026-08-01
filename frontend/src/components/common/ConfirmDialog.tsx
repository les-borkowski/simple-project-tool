import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'

interface Props {
  title: string
  description?: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmDialog({ title, description, onConfirm, onCancel, confirmLabel, danger = true }: Props) {
  const { t } = useTranslation()
  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 tap-safe"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md text-white tap-safe ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'accent-bg'
            }`}
          >
            {confirmLabel ?? t('actions.confirm')}
          </button>
        </div>
      }
    >
      {description && (
        <p className="text-sm text-stone-500 dark:text-stone-300">{description}</p>
      )}
    </Modal>
  )
}
