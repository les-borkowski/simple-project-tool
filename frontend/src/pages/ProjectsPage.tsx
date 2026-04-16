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
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'
import type { Status, Priority } from '../services/api'

export function ProjectsPage() {
  const { t } = useTranslation()
  const { isManager } = useRole()
  const { addToast } = useToast()

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
      addToast('Project created')
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
    addToast('Project deleted')
  }

  const [editProject, setEditProject] = useState<{ id: string; name: string; description: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editProject) return
    setSaving(true)
    try {
      await projectsApi.update(editProject.id, { name: editProject.name, description: editProject.description || undefined })
      setEditProject(null)
      refresh()
      addToast('Project updated')
    } finally {
      setSaving(false)
    }
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
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm rounded-md font-medium"
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
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message={t('projects.empty')}
          action={isManager ? { label: t('projects.create'), onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {items.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-base font-medium text-sky-600 hover:underline"
                >
                  {project.name}
                </Link>
                {project.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5 truncate">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <StatusBadge status={project.status} />
                  <PriorityBadge priority={project.priority} />
                  {project.archived_at && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      Archived
                    </span>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-400">{formatRelative(project.created_at)}</span>
                </div>
              </div>
              {isManager && (
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => setEditProject({ id: project.id, name: project.name, description: project.description ?? '' })}
                    className="text-sm text-sky-500 hover:text-sky-700"
                  >
                    {t('actions.edit')}
                  </button>
                  <button
                    onClick={() => setDeleteId(project.id)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    {t('actions.delete')}
                  </button>
                </div>
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
                <MarkdownEditor value={newDesc} onChange={setNewDesc} rows={3} />
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
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50"
                >
                  {t('actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('actions.edit')}</h3>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={editProject.name}
                  onChange={(e) => setEditProject({ ...editProject, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.description')}</label>
                <MarkdownEditor value={editProject.description} onChange={(v) => setEditProject({ ...editProject, description: v })} rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditProject(null)}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md"
                >
                  {t('actions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50"
                >
                  {t('actions.save')}
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
