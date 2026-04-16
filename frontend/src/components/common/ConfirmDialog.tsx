import { useTranslation } from 'react-i18next'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-300 mb-4">{description}</p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md text-white ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {confirmLabel ?? t('actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
