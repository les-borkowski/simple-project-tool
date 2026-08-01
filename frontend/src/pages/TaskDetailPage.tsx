import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tasksApi, projectsApi, storiesApi, isDemoBlockedError } from '../services/api'
import type { TaskResponse, MemberResponse, Status, Priority, StoryResponse } from '../services/api'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useProjectSprints } from '../hooks/useProjectSprints'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { DetailField } from '../components/common/DetailField'
import { DetailRail } from '../components/common/DetailRail'
import { Breadcrumbs } from '../components/common/Breadcrumbs'
import type { Crumb } from '../components/common/Breadcrumbs'
import { PageHeader } from '../components/layout/PageHeader'
import { useToast } from '../context/ToastContext'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'
import { formatRelative } from '../utils/time'

const ICaret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

export function TaskDetailPage() {
  const { taskId } = useParams<{ storyId: string; taskId: string }>()
  const { t } = useTranslation()
  const { addToast } = useToast()

  const [task, setTask] = useState<TaskResponse | null>(null)
  const { statuses: projectStatuses } = useProjectStatuses(task?.project_id)
  const { sprints } = useProjectSprints(task?.project_id)
  const [story, setStory] = useState<StoryResponse | null>(null)
  const [stories, setStories] = useState<StoryResponse[]>([])
  const [projectName, setProjectName] = useState('')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState('')
  const [effortDraft, setEffortDraft] = useState<string>('')

  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    tasksApi.get(taskId).then(async (res) => {
      if (cancelled) return
      setTask(res.data)
      setDesc(res.data.description ?? '')
      setTitleDraft(res.data.title)
      setEffortDraft(String(res.data.effort ?? ''))
      const projectId = res.data.project_id
      storiesApi.list(projectId).then(storiesRes => {
        if (!cancelled) setStories(storiesRes.data.items)
      }).catch(() => {})
      try {
        if (res.data.story_id) {
          const storyRes = await storiesApi.get(res.data.story_id)
          if (cancelled) return
          setStory(storyRes.data)
          const mRes = await projectsApi.listMembers(storyRes.data.project_id)
          if (cancelled) return
          setMembers(mRes.data)
          const pRes = await projectsApi.get(storyRes.data.project_id)
          if (cancelled) return
          setProjectName(pRes.data.name)
        } else {
          const mRes = await projectsApi.listMembers(res.data.project_id)
          if (cancelled) return
          setMembers(mRes.data)
          const pRes = await projectsApi.get(res.data.project_id)
          if (cancelled) return
          setProjectName(pRes.data.name)
        }
      } catch {
        // non-critical
      }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskId])

  const handleStatusChange = async (status: Status) => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { status })
      setTask(res.data)
      addToast(t('tasks.status_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    } finally {
      setEditingStatus(false)
    }
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { priority })
      setTask(res.data)
      addToast(t('tasks.priority_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    } finally {
      setEditingPriority(false)
    }
  }

  const handleAssigneeChange = async (assignee_id: string) => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { assignee_id: assignee_id || null })
      setTask(res.data)
      addToast(t('tasks.assignee_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    }
  }

  const handleStoryChange = async (story_id: string) => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { story_id: story_id || null })
      setTask(res.data)
      if (story_id) {
        setStory(null)
        try {
          const storyRes = await storiesApi.get(story_id)
          setStory(storyRes.data)
        } catch {
          // task update succeeded; silently ignore story fetch failure
        }
      } else {
        setStory(null)
      }
      addToast(t('tasks.story_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    }
  }

  const handleSprintChange = async (sprint_id: string) => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { sprint_id: sprint_id || null })
      setTask(res.data)
      addToast(t('tasks.sprint_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    }
  }

  const handleEffortChange = async (effort: string) => {
    if (!taskId) return
    const parsed = effort ? parseInt(effort, 10) : null
    if (effort && (isNaN(parsed!) || parsed! < 0)) return
    try {
      const res = await tasksApi.update(taskId, { effort: parsed })
      setTask(res.data)
      setEffortDraft(String(parsed ?? ''))
      addToast(t('tasks.effort_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    }
  }

  const handleSaveTitle = async () => {
    if (!taskId || !titleDraft.trim() || titleDraft === task?.title) {
      setEditingTitle(false)
      return
    }
    try {
      const res = await tasksApi.update(taskId, { title: titleDraft.trim() })
      setTask(res.data)
      addToast(t('tasks.title_updated'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    } finally {
      setEditingTitle(false)
    }
  }

  const handleSaveDesc = async () => {
    if (!taskId) return
    try {
      const res = await tasksApi.update(taskId, { description: desc })
      setTask(res.data)
      addToast(t('tasks.description_saved'))
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    } finally {
      setEditingDesc(false)
    }
  }

  const priorities: Priority[] = ['low', 'medium', 'high']

  // Handed to both branches so the loading header reserves the same boxes the
  // loaded one fills. A task under a story is a four-crumb trail (Projects /
  // project / story / task); a project-level task (no story) is three —
  // Breadcrumbs only collapses below md when it is handed more than three.
  const crumbs: Crumb[] = story
    ? [
        { label: t('projects.title'), to: '/projects' },
        { label: projectName || '…', to: `/projects/${story.project_id}` },
        { label: story.title, to: `/projects/${story.project_id}/stories/${story.id}` },
        { label: task?.title ?? '' },
      ]
    : task?.project_id
      ? [
          { label: t('projects.title'), to: '/projects' },
          { label: projectName || '…', to: `/projects/${task.project_id}` },
          { label: task?.title ?? '' },
        ]
      : [{ label: t('projects.title'), to: '/projects' }]

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <PageHeader loading title={task?.title ?? ''} breadcrumbs={<Breadcrumbs items={crumbs} />} meta={<span />} />
      <div className="px-7 py-5">
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )
  if (!task) return null

  const assignee = members.find(m => m.user_id === task.assignee_id)

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        title={task.title}
        onTitleClick={() => { setTitleDraft(task.title); setEditingTitle(true) }}
        titleEditor={
          editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false) }
              }}
              className="text-ui-3xl font-semibold tracking-tight w-full bg-transparent border-b border-stone-300 dark:border-stone-600 outline-none py-0.5"
            />
          ) : undefined
        }
        breadcrumbs={<Breadcrumbs items={crumbs} />}
        meta={
          <>
            {editingStatus ? (
              <select
                autoFocus
                defaultValue={task.status}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                onBlur={() => setEditingStatus(false)}
                className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {projectStatuses.map((ps) => (
                  <option key={ps.slug} value={ps.slug}>{ps.name}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-900"
              >
                <StatusPill status={task.status} statuses={projectStatuses} /> <ICaret />
              </button>
            )}
            {editingPriority ? (
              <select
                autoFocus
                defaultValue={task.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                onBlur={() => setEditingPriority(false)}
                className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
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
              <span className="text-ui-sm text-stone-500">· {t('detail.assigned_to', { name: assignee.name })}</span>
            )}
          </>
        }
      />

      {/* Two-column layout: the rail comes first in the DOM so the phone reader
          meets it before the description and the comment thread, and the page
          scrolls as one document rather than nesting a scroller. The rail
          takes itself back to the right-hand track at lg. */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] min-h-0">
        {/* Right rail */}
        <DetailRail
          label={t('detail.details')}
          secondary={{
            label: t('history.title'),
            children: <StatusHistoryTimeline itemType="task" itemId={taskId!} statuses={projectStatuses} />,
          }}
        >
          {/* Status */}
          <DetailField label={t('detail.status')}>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value as Status)}
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              {projectStatuses.map((ps) => (
                <option key={ps.slug} value={ps.slug}>{ps.name}</option>
              ))}
            </select>
          </DetailField>

          {/* Priority */}
          <DetailField label={t('detail.priority')}>
            <select
              value={task.priority}
              onChange={(e) => handlePriorityChange(e.target.value as Priority)}
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </DetailField>

          {/* Assignee */}
          <DetailField label={t('detail.assignee')}>
            <select
              value={task.assignee_id ?? ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              <option value="">{t('tasks.unassigned')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          </DetailField>

          {/* Story */}
          <DetailField label={t('detail.story')}>
            <select
              value={task.story_id ?? ''}
              onChange={(e) => handleStoryChange(e.target.value)}
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              {[...stories].sort((a, b) => a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1).map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </DetailField>

          {/* Sprint */}
          <DetailField label={t('detail.sprint')}>
            <select
              value={task.sprint_id ?? ''}
              onChange={(e) => handleSprintChange(e.target.value)}
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            >
              <option value="">{t('sprints.no_sprint')}</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </DetailField>

          {/* Effort */}
          <DetailField label={t('detail.effort')}>
            <input
              type="number"
              min="0"
              value={effortDraft}
              onChange={(e) => setEffortDraft(e.target.value)}
              onBlur={(e) => handleEffortChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="—"
              className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full"
            />
          </DetailField>

          {/* Project */}
          <DetailField label={t('detail.project')}><span className="text-stone-700 dark:text-stone-200">{projectName}</span></DetailField>
          {/* Created */}
          <DetailField label={t('detail.created')}><span className="text-stone-500">{formatRelative(task.created_at)}</span></DetailField>
        </DetailRail>

        {/* Main */}
        <div className="px-7 py-5 space-y-8 overflow-visible lg:overflow-y-auto">
          {/* Description */}
          <section>
            <h2 className="text-ui-md font-medium text-stone-700 dark:text-stone-200 mb-2">{t('detail.description')}</h2>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
              {editingDesc ? (
                <div className="space-y-2">
                  <MarkdownEditor value={desc} onChange={setDesc} rows={10} autoExpand maxHeight="calc(100dvh - 240px)" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="px-3 py-1.5 text-ui-md accent-bg rounded-md">{t('actions.save')}</button>
                    <button onClick={() => { setEditingDesc(false); setDesc(task.description ?? '') }} className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingDesc(true)} className="w-full text-left">
                  {task.description
                    ? <div className="prose prose-sm dark:prose-invert max-w-none text-ui-lg leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown></div>
                    : <p className="text-ui-md text-stone-400 italic">{t('detail.add_description')}</p>}
                </button>
              )}
            </div>
          </section>

          {/* Comments */}
          <section>
            <h2 className="text-ui-md font-medium text-stone-700 dark:text-stone-200 mb-3">{t('comments.title')}</h2>
            <CommentList itemType="task" itemId={taskId!} />
          </section>
        </div>
      </div>
    </div>
  )
}
