import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { storiesApi, tasksApi, projectsApi } from '../services/api'
import type { StoryResponse, Status, Priority, MemberResponse } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useTasks } from '../hooks/useTasks'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'

type SortField = 'created_at' | 'status' | 'priority' | 'title'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, in_testing: 3, done: 4 }
const PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

function applySortField<T extends { created_at: string; status: string; priority: string; title: string }>(
  a: T, b: T, field: SortField
): number {
  if (field === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (field === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (field === 'title') return a.title.localeCompare(b.title)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export function StoryDetailPage() {
  const { projectId, storyId } = useParams<{ projectId: string; storyId: string }>()
  const { t } = useTranslation()
  const { isManager } = useRole(projectId)
  const { addToast } = useToast()

  const [story, setStory] = useState<StoryResponse | null>(null)
  const [projectName, setProjectName] = useState('')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)

  const tasksHook = useTasks(storyId ?? '')
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<{ id: string; title: string; description: string } | null>(null)
  const [savingTask, setSavingTask] = useState(false)
  const [editingTaskField, setEditingTaskField] = useState<{ id: string; field: 'status' | 'priority' } | null>(null)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    if (!storyId) return
    storiesApi.get(storyId).then((res) => {
      setStory(res.data)
      if (projectId) {
        projectsApi.get(projectId).then((p) => setProjectName(p.data.name))
        projectsApi.listMembers(projectId).then((m) => setMembers(m.data))
      }
    }).finally(() => setLoading(false))
  }, [storyId, projectId])

  const handleStatusChange = async (status: Status) => {
    if (!storyId) return
    const res = await storiesApi.update(storyId, { status })
    setStory(res.data)
    setEditingStatus(false)
    addToast('Status updated')
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!storyId) return
    const res = await storiesApi.update(storyId, { priority })
    setStory(res.data)
    setEditingPriority(false)
    addToast('Priority updated')
  }

  const handleTaskFieldChange = async (taskId: string, field: 'status' | 'priority', value: string) => {
    const res = await tasksApi.update(taskId, { [field]: value })
    tasksHook.setItems((prev) => prev.map((t) => t.id === taskId ? res.data : t))
    setEditingTaskField(null)
    addToast(`${field === 'status' ? 'Status' : 'Priority'} updated`)
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTask) return
    setSavingTask(true)
    try {
      await tasksApi.update(editTask.id, { title: editTask.title, description: editTask.description || undefined })
      setEditTask(null)
      tasksHook.refresh()
      addToast('Task updated')
    } finally {
      setSavingTask(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!storyId) return
    setCreatingTask(true)
    try {
      await tasksApi.create(storyId, { title: newTaskTitle })
      setShowCreateTask(false)
      setNewTaskTitle('')
      tasksHook.refresh()
      addToast('Task created')
    } finally {
      setCreatingTask(false)
    }
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  if (loading) return (
    <div className="space-y-3 mt-6">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
  if (!story) return null

  return (
    <div>
      <nav className="text-sm text-gray-500 dark:text-gray-300 mb-4">
        <Link to="/projects" className="hover:underline">{t('projects.title')}</Link>
        <span className="mx-2">/</span>
        <Link to={`/projects/${projectId}`} className="hover:underline">{projectName || '…'}</Link>
        <span className="mx-2">/</span>
        <span>{story.title}</span>
      </nav>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">{story.title}</h1>
          <div className="flex items-center gap-2">
            {editingStatus ? (
              <select
                autoFocus
                defaultValue={story.status}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                onBlur={() => setEditingStatus(false)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            ) : (
              <button onClick={() => setEditingStatus(true)}><StatusBadge status={story.status} /></button>
            )}
            {editingPriority ? (
              <select
                autoFocus
                defaultValue={story.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                onBlur={() => setEditingPriority(false)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
              </select>
            ) : (
              <button onClick={() => setEditingPriority(true)}>
                <PriorityBadge priority={story.priority} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('tasks.title')}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-300">Sort by</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="created_at">Created</option>
              <option value="status">Status</option>
              <option value="priority">Priority</option>
              <option value="title">Title</option>
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
            <button
              onClick={() => setShowCreateTask(true)}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md"
            >
              {t('tasks.create')}
            </button>
          </div>
        </div>
        {tasksHook.items.length === 0 ? (
          <EmptyState
            message={t('tasks.empty')}
            action={isManager ? { label: t('tasks.create'), onClick: () => setShowCreateTask(true) } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {[...tasksHook.items].sort((a, b) => {
              const c = applySortField(a, b, sortField)
              return sortDir === 'asc' ? c : -c
            }).map((task) => (
              <div key={task.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/stories/${storyId}/tasks/${task.id}`}
                    className="font-medium text-sky-600 hover:underline"
                  >
                    {task.title}
                  </Link>
                  {task.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {editingTaskField?.id === task.id && editingTaskField.field === 'status' ? (
                      <select
                        autoFocus
                        defaultValue={task.status}
                        onChange={(e) => handleTaskFieldChange(task.id, 'status', e.target.value)}
                        onBlur={() => setEditingTaskField(null)}
                        className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      >
                        {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setEditingTaskField({ id: task.id, field: 'status' })}>
                        <StatusBadge status={task.status} />
                      </button>
                    )}
                    {editingTaskField?.id === task.id && editingTaskField.field === 'priority' ? (
                      <select
                        autoFocus
                        defaultValue={task.priority}
                        onChange={(e) => handleTaskFieldChange(task.id, 'priority', e.target.value)}
                        onBlur={() => setEditingTaskField(null)}
                        className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      >
                        {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setEditingTaskField({ id: task.id, field: 'priority' })}>
                        <PriorityBadge priority={task.priority} />
                      </button>
                    )}
                    {task.assignee_id && (() => {
                      const m = members.find(m => m.user_id === task.assignee_id)
                      if (!m) return null
                      const initials = m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                      return (
                        <span title={m.name} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 text-[10px] font-semibold">
                          {initials}
                        </span>
                      )
                    })()}
                    <span className="text-xs text-gray-400 dark:text-gray-400">{formatRelative(task.created_at)}</span>
                  </div>
                </div>
                {isManager && (
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => setEditTask({ id: task.id, title: task.title, description: task.description ?? '' })}
                      className="text-sm text-sky-500 hover:text-sky-700"
                    >
                      {t('actions.edit')}
                    </button>
                    <button onClick={() => setDeleteTaskId(task.id)} className="text-sm text-red-500 hover:text-red-700">
                      {t('actions.delete')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tasksHook.nextCursor && <LoadMoreButton onLoadMore={tasksHook.loadMore} isLoading={tasksHook.isLoading} />}
      </div>

      {/* Comments */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">{t('comments.title')}</h2>
        <CommentList itemType="story" itemId={storyId!} />
      </div>

      {/* Status history */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('history.title')}</h2>
        <StatusHistoryTimeline itemType="story" itemId={storyId!} />
      </div>

      {showCreateTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('tasks.create')}</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <input
                type="text"
                placeholder={t('tasks.title')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateTask(false)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md">{t('actions.cancel')}</button>
                <button type="submit" disabled={creatingTask} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50">{t('actions.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit task modal */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('actions.edit')}</h3>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={editTask.title}
                  onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.description')}</label>
                <MarkdownEditor value={editTask.description} onChange={(v) => setEditTask({ ...editTask, description: v })} rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditTask(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={savingTask} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50">
                  {t('actions.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTaskId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={`Delete task "${tasksHook.items.find(t => t.id === deleteTaskId)?.title ?? ''}"?`}
          onConfirm={async () => {
            await tasksApi.delete(deleteTaskId)
            setDeleteTaskId(null)
            tasksHook.refresh()
            addToast('Task deleted')
          }}
          onCancel={() => setDeleteTaskId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
