import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tasksApi, projectsApi, storiesApi } from '../services/api'
import type { TaskResponse, MemberResponse, Status, Priority, StoryResponse } from '../services/api'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'

export function TaskDetailPage() {
  const { storyId, taskId } = useParams<{ storyId: string; taskId: string }>()
  const { t } = useTranslation()

  const { addToast } = useToast()
  const [task, setTask] = useState<TaskResponse | null>(null)
  const [story, setStory] = useState<StoryResponse | null>(null)
  const [projectName, setProjectName] = useState('')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState('')

  useEffect(() => {
    if (!taskId) return
    tasksApi.get(taskId).then(async (res) => {
      setTask(res.data)
      setDesc(res.data.description ?? '')
      // Get project members for assignee picker via story
      try {
        const storyRes = await storiesApi.get(res.data.story_id)
        setStory(storyRes.data)
        const mRes = await projectsApi.listMembers(storyRes.data.project_id)
        setMembers(mRes.data)
        const pRes = await projectsApi.get(storyRes.data.project_id)
        setProjectName(pRes.data.name)
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
    addToast('Status updated')
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { priority })
    setTask(res.data)
    setEditingPriority(false)
    addToast('Priority updated')
  }

  const handleAssigneeChange = async (assignee_id: string) => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { assignee_id: assignee_id || null })
    setTask(res.data)
    addToast('Assignee updated')
  }

  const handleSaveDesc = async () => {
    if (!taskId) return
    const res = await tasksApi.update(taskId, { description: desc })
    setTask(res.data)
    setEditingDesc(false)
    addToast('Description saved')
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  if (loading) return (
    <div className="space-y-3 mt-6">
      {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
  if (!task) return null

  return (
    <div>
      <nav className="text-sm text-gray-500 dark:text-gray-300 mb-4">
        <Link to="/projects" className="hover:underline">{t('projects.title')}</Link>
        <span className="mx-2">/</span>
        {story && (
          <>
            <Link to={`/projects/${story.project_id}`} className="hover:underline">{projectName || '…'}</Link>
            <span className="mx-2">/</span>
            <Link to={`/projects/${story.project_id}/stories/${storyId}`} className="hover:underline">{story.title}</Link>
            <span className="mx-2">/</span>
          </>
        )}
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
              {editingPriority ? (
                <select
                  autoFocus
                  defaultValue={task.priority}
                  onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                  onBlur={() => setEditingPriority(false)}
                  className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                >
                  {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
              ) : (
                <button onClick={() => setEditingPriority(true)}>
                  <PriorityBadge priority={task.priority} />
                </button>
              )}
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
              {editingDesc ? (
                <div className="space-y-2">
                  <MarkdownEditor value={desc} onChange={setDesc} rows={4} />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="px-3 py-1 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded">{t('actions.save')}</button>
                    <button onClick={() => { setEditingDesc(false); setDesc(task.description ?? '') }} className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingDesc(true)} className="w-full text-left">
                  {task.description
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert max-w-none text-left">{task.description}</ReactMarkdown>
                    : <p className="text-sm text-gray-400 dark:text-gray-400 italic">Add description…</p>}
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-300 mb-2">{t('tasks.assignee')}</h3>
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
