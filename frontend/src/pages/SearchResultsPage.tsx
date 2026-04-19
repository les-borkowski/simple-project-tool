import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { searchApi } from '../services/api'
import type { RecentItemResponse } from '../services/api'
import { SkeletonCard } from '../components/common/Skeleton'

const IFolder = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
)
const IDoc = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6M8 13h8M8 17h5"/>
  </svg>
)
const ICheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)

function typeIcon(type: RecentItemResponse['type']) {
  if (type === 'project') return <IFolder />
  if (type === 'story') return <IDoc />
  return <ICheck />
}

function recentLink(item: RecentItemResponse): string {
  if (item.type === 'project') return `/projects/${item.id}`
  if (item.type === 'story') return `/projects/${item.project_id}/stories/${item.id}`
  if (item.story_id) return `/stories/${item.story_id}/tasks/${item.id}`
  return `/projects/${item.project_id}/tasks/${item.id}`
}

interface GroupSectionProps {
  label: string
  items: RecentItemResponse[]
}

function GroupSection({ label, items }: GroupSectionProps) {
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-wider text-stone-400 font-medium px-4 py-2">
        {label} ({items.length})
      </h2>
      <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800/80">
        {items.map(item => (
          <Link
            key={item.id}
            to={recentLink(item)}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg"
          >
            <span className="text-stone-400 shrink-0">{typeIcon(item.type)}</span>
            <span className="font-medium text-[13.5px] truncate">{item.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function SearchResultsPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''

  const [results, setResults] = useState<RecentItemResponse[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q) {
      setResults([])
      return
    }
    setLoading(true)
    searchApi.search(q)
      .then(res => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [q])

  const projects = results.filter(r => r.type === 'project')
  const stories = results.filter(r => r.type === 'story')
  const tasks = results.filter(r => r.type === 'task')

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-7 pt-5 pb-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <h1 className="text-[22px] font-semibold tracking-tight">
          {t('search.title', { q })}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 px-7 py-5 space-y-6 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-stone-400 text-[13.5px]">
            {t('search.empty', { q })}
          </div>
        ) : (
          <>
            <GroupSection label={t('search.group_projects')} items={projects} />
            <GroupSection label={t('search.group_stories')} items={stories} />
            <GroupSection label={t('search.group_tasks')} items={tasks} />
          </>
        )}
      </div>
    </div>
  )
}
