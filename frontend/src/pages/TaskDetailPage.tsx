import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { tasksApi, projectsApi, storiesApi } from '../services/api'
import type { TaskResponse, MemberResponse, Status, Priority } from '../services/api'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'

export function TaskDetailPage() {
  const { storyId, taskId } = useParams<{ storyId: string; taskId: string }>()
  const { t } = useTranslation()

  const [task, setTask] = useState<TaskResponse | null>(null)
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState('')

  useEffect(() => {
    if (!taskId) return
    tasksApi.get(taskId).then(async (res) => {
      setTask(res.data)
      setDesc(res.data.description ?? '')
      // Get project members for assignee picker via story
      try {
        const story = await storiesApi.get(res.data.story_id)
        const mRes = await projectsApi.listMembers(story.data.project_id)
        setMembers(mRes.data)
      } catch {
        // non-critical
      }
    }).finally(() => setLoading(false))
  }, [taskId])

  const handleStatusChange = async (status: Status) => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { status })
    setTask(res.data)
    setEditingStatus(false)
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { priority })
    setTask(res.data)
  }

  const handleAssigneeChange = async (assignee_id: string) => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { assignee_id: assignee_id || null })
    setTask(res.data)
  }

  const handleSaveDesc = async () => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { description: desc })
    setTask(res.data)
    setEditingDesc(false)
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  if (!task) return null

  return (
    <div>
      <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link to="/projects" className="hover:underline">{t('projects.title')}</Link>
        <span className="mx-2">/</span>
        <Link to={`/stories/${storyId}`} className="hover:underline">{t('stories.title')}</Link>
        <span className="mx-2">/</span>
        <span>{task.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-3">{task.title}</h1>
            <div className="flex items-center gap-2 mb-4">
              {editingStatus ? (
                <select
                  autoFocus
                  defaultValue={task.status}
                  onChange={(e) => handleStatusChange(e.target.value as Status)}
                  onBlur={() => setEditingStatus(false)}
                  className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                >
                  {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
              ) : (
                <button onClick={() => setEditingStatus(true)}><StatusBadge status={task.status} /></button>
              )}
              <PriorityBadge priority={task.priority} />
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded">{t('actions.save')}</button>
                    <button onClick={() => { setEditingDesc(false); setDesc(task.description ?? '') }} className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingDesc(true)} className="w-full text-left">
                  {task.description
                    ? <p className="text-sm text-gray-700 dark:text-gray-300">{task.description}</p>
                    : <p className="text-sm text-gray-400 dark:text-gray-500 italic">Add description…</p>}
                </button>
              )}
            </div>
          </div>

          {/* Comments */}
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('comments.title')}</h2>
            <CommentList itemType="task" itemId={taskId!} />
          </div>

          {/* Status history */}
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('history.title')}</h2>
            <StatusHistoryTimeline itemType="task" itemId={taskId!} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t('filter.priority')}</h3>
            <select
              value={task.priority}
              onChange={(e) => handlePriorityChange(e.target.value as Priority)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t('tasks.assignee')}</h3>
            <select
              value={task.assignee_id ?? ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
            >
              <option value="">{t('tasks.unassigned')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
