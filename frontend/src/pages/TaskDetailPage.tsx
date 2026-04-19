import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tasksApi, projectsApi, storiesApi } from '../services/api'
import type { TaskResponse, MemberResponse, Status, Priority, StoryResponse } from '../services/api'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'
import { formatRelative } from '../utils/time'

const ICaret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}

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
      try {
        if (res.data.story_id) {
          const storyRes = await storiesApi.get(res.data.story_id)
          setStory(storyRes.data)
          const mRes = await projectsApi.listMembers(storyRes.data.project_id)
          setMembers(mRes.data)
          const pRes = await projectsApi.get(storyRes.data.project_id)
          setProjectName(pRes.data.name)
        } else {
          const mRes = await projectsApi.listMembers(res.data.project_id)
          setMembers(mRes.data)
          const pRes = await projectsApi.get(res.data.project_id)
          setProjectName(pRes.data.name)
        }
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
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-6 pb-4">
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )
  if (!task) return null

  const assignee = members.find(m => m.user_id === task.assignee_id)

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-7 pt-5 pb-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="flex items-center gap-2 text-[11.5px] text-stone-500 mb-2">
          <Link to="/projects" className="hover:text-stone-800 dark:hover:text-stone-200">{t('projects.title')}</Link>
          <span>/</span>
          {story && (
            <>
              <Link to={`/projects/${story.project_id}`} className="hover:text-stone-800 dark:hover:text-stone-200">{projectName || '…'}</Link>
              <span>/</span>
              <Link to={`/projects/${story.project_id}/stories/${storyId}`} className="hover:text-stone-800 dark:hover:text-stone-200">{story.title}</Link>
              <span>/</span>
            </>
          )}
          <span>{task.title}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{task.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {editingStatus ? (
                <select
                  autoFocus
                  defaultValue={task.status}
                  onChange={(e) => handleStatusChange(e.target.value as Status)}
                  onBlur={() => setEditingStatus(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setEditingStatus(true)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-900"
                >
                  <StatusPill status={task.status} /> <ICaret />
                </button>
              )}
              {editingPriority ? (
                <select
                  autoFocus
                  defaultValue={task.priority}
                  onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                  onBlur={() => setEditingPriority(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
              ) : (
                <button
                  onClick={() => setEditingPriority(true)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-900"
                >
                  <PriorityBars priority={task.priority} withLabel /> <ICaret />
                </button>
              )}
              {assignee && (
                <span className="text-[11.5px] text-stone-500">· {t('detail.assigned_to', { name: assignee.name })}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] min-h-0">
        {/* Main */}
        <div className="px-7 py-5 space-y-8 overflow-y-auto">
          {/* Description */}
          <section>
            <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200 mb-2">{t('detail.description')}</h2>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
              {editingDesc ? (
                <div className="space-y-2">
                  <MarkdownEditor value={desc} onChange={setDesc} rows={5} />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md">{t('actions.save')}</button>
                    <button onClick={() => { setEditingDesc(false); setDesc(task.description ?? '') }} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingDesc(true)} className="w-full text-left">
                  {task.description
                    ? <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown></div>
                    : <p className="text-[13px] text-stone-400 italic">{t('detail.add_description')}</p>}
                </button>
              )}
            </div>
          </section>

          {/* Comments */}
          <section>
            <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200 mb-3">{t('comments.title')}</h2>
            <CommentList itemType="task" itemId={taskId!} />
          </section>
        </div>

        {/* Right rail */}
        <aside className="border-l border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/30 px-5 py-5 space-y-5 text-[12.5px]">
          <DetailField label={t('detail.status')}><StatusPill status={task.status} /></DetailField>
          <DetailField label={t('detail.priority')}><PriorityBars priority={task.priority} withLabel /></DetailField>
          <DetailField label={t('detail.assignee')}>
            <select
              value={task.assignee_id ?? ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              <option value="">{t('tasks.unassigned')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          </DetailField>
          {story && (
            <DetailField label={t('detail.story')}>
              <Link to={`/projects/${story.project_id}/stories/${storyId}`} className="accent-text hover:underline text-[12.5px]">
                {story.title}
              </Link>
            </DetailField>
          )}
          <DetailField label={t('detail.project')}><span className="text-stone-700 dark:text-stone-200">{projectName}</span></DetailField>
          <DetailField label={t('detail.created')}><span className="text-stone-500">{formatRelative(task.created_at)}</span></DetailField>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-stone-400 mb-2 font-medium">{t('history.title')}</div>
            <StatusHistoryTimeline itemType="task" itemId={taskId!} />
          </div>
        </aside>
      </div>
    </div>
  )
}
