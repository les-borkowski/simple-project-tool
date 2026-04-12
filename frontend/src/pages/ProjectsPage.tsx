import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useProjects } from '../hooks/useProjects'
import { useRole } from '../hooks/useRole'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { projectsApi } from '../services/api'
import type { Status, Priority } from '../services/api'

export function ProjectsPage() {
  const { t } = useTranslation()
  const { isManager } = useRole()

  const [statusFilter, setStatusFilter] = useState<Status | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')

  const { items, nextCursor, isLoading, initialized, refresh, loadMore } = useProjects({
    status: statusFilter,
    priority: priorityFilter,
    archived,
    q: search,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await projectsApi.create({ name: newName, description: newDesc || undefined })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      refresh()
    } finally {
      setCreating(false)
    }
  }

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const handleDelete = async () => {
    if (!deleteId) return
    await projectsApi.delete(deleteId)
    setDeleteId(null)
    refresh()
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
        {isManager && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-md font-medium"
          >
            {t('projects.create')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | '')}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
        >
          <option value="">{t('filter.status')}: {t('filter.all')}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
        >
          <option value="">{t('filter.priority')}: {t('filter.all')}</option>
          {priorities.map((p) => (
            <option key={p} value={p}>{t(`priority.${p}`)}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {t('projects.archived')}
        </label>
        <input
          type="text"
          placeholder={t('filter.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 min-w-[180px]"
        />
      </div>

      {/* List */}
      {!initialized ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState message={t('projects.empty')} />
      ) : (
        <div className="space-y-3">
          {items.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-base font-medium text-indigo-600 hover:underline"
                >
                  {project.name}
                </Link>
                {project.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {project.description}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                  {project.archived_at && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      Archived
                    </span>
                  )}
                </div>
              </div>
              {isManager && (
                <button
                  onClick={() => setDeleteId(project.id)}
                  className="text-sm text-red-500 hover:text-red-700 shrink-0"
                >
                  {t('actions.delete')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {nextCursor && <LoadMoreButton onLoadMore={loadMore} isLoading={isLoading} />}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('projects.create')}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.description')}</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50"
                >
                  {t('actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={t('actions.delete') + ' project?'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
