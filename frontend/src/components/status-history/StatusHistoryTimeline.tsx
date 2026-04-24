import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timeTrackingApi } from '../../services/api'
import type { StatusHistoryEntry, ProjectStatusResponse } from '../../services/api'
import { StatusBadge } from '../common/StatusBadge'
import { EmptyState } from '../common/EmptyState'
import { formatDate, formatDuration } from '../../utils/format'
import i18n from '../../i18n'

type ItemType = 'project' | 'story' | 'task'

interface Props {
  itemType: ItemType
  itemId: string
  statuses: ProjectStatusResponse[]
}

export function StatusHistoryTimeline({ itemType, itemId, statuses }: Props) {
  const { t } = useTranslation()
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        let res
        if (itemType === 'project') res = await timeTrackingApi.historyForProject(itemId)
        else if (itemType === 'story') res = await timeTrackingApi.historyForStory(itemId)
        else res = await timeTrackingApi.historyForTask(itemId)
        setHistory(res.data)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [itemId, itemType])

  if (loading) return <div className="animate-pulse h-16 bg-gray-100 dark:bg-gray-700 rounded" />

  if (history.length === 0) return <EmptyState message={t('history.empty')} />

  return (
    <div className="space-y-2">
      {history.map((entry, i) => (
        <div key={entry.id} className="flex gap-4 items-start">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5" />
            {i < history.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
          </div>
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.from_status && <StatusBadge status={entry.from_status} statuses={statuses} />}
              {entry.from_status && <span className="text-gray-400">→</span>}
              <StatusBadge status={entry.to_status} statuses={statuses} />
              {entry.elapsed_seconds != null && (
                <span className="text-xs text-gray-400 ml-1">
                  ({t('history.elapsed')}: {formatDuration(entry.elapsed_seconds, t)})
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-300 mt-0.5">
              {t('history.changed_by')}: {entry.changed_by_name} &middot; {formatDate(entry.changed_at, i18n.language)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
