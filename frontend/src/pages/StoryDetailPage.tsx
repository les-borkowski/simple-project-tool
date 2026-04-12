import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { storiesApi, tasksApi } from '../services/api'
import type { StoryResponse, Status } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useTasks } from '../hooks/useTasks'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'

export function StoryDetailPage() {
  const { projectId, storyId } = useParams<{ projectId: string; storyId: string }>()
  const { t } = useTranslation()
  const { isManager } = useRole(projectId)

  const [story, setStory] = useState<StoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)

  const tasksHook = useTasks(storyId ?? '')
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (!storyId) return
    storiesApi.get(storyId).then((res) => setStory(res.data)).finally(() => setLoading(false))
  }, [storyId])

  const handleStatusChange = async (status: Status) => {
    if (!storyId) return
    const res = await storiesApi.update(storyId, { status })
    setStory(res.data)
    setEditingStatus(false)
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
    } finally {
      setCreatingTask(false)
    }
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!story) return null

  return (
    <div>
      <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link to="/projects" className="hover:underline">{t('projects.title')}</Link>
        <span className="mx-2">/</span>
        <Link to={`/projects/${projectId}`} className="hover:underline">{projectId?.slice(0, 8)}</Link>
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
            <PriorityBadge priority={story.priority} />
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('tasks.title')}</h2>
          <button
            onClick={() => setShowCreateTask(true)}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
          >
            {t('tasks.create')}
          </button>
        </div>
        {tasksHook.items.length === 0 ? (
          <EmptyState message={t('tasks.empty')} />
        ) : (
          <div className="space-y-2">
            {tasksHook.items.map((task) => (
              <div key={task.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/stories/${storyId}/tasks/${task.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <div className="flex gap-2 mt-1">
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
                {isManager && (
                  <button onClick={() => setDeleteTaskId(task.id)} className="text-sm text-red-500 hover:text-red-700 shrink-0">
                    {t('actions.delete')}
                  </button>
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
                <button type="submit" disabled={creatingTask} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50">{t('actions.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTaskId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          onConfirm={async () => {
            await tasksApi.delete(deleteTaskId)
            setDeleteTaskId(null)
            tasksHook.refresh()
          }}
          onCancel={() => setDeleteTaskId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
