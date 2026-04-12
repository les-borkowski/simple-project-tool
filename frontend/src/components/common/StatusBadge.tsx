import { useTranslation } from 'react-i18next'
import type { Status } from '../../services/api'

const colorMap: Record<Status, string> = {
  to_do: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  in_testing: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[status]}`}>
      {t(`status.${status}`)}
    </span>
  )
}
