import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { storiesApi, tasksApi, projectsApi } from '../services/api'
import type { StoryResponse, Status, Priority, MemberResponse } from '../services/api'
import { CreateTaskModal } from '../components/tasks/CreateTaskModal'
import { useRole } from '../hooks/useRole'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useTasks } from '../hooks/useTasks'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { DetailField } from '../components/common/DetailField'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'
import { applySortField } from '../utils/sort'
import { initials } from '../utils/initials'
import { CommentList } from '../components/comments/CommentList'
import { StatusHistoryTimeline } from '../components/status-history/StatusHistoryTimeline'

const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

type SortField = 'created_at' | 'status' | 'priority' | 'title'
type SortDir = 'asc' | 'desc'

export function StoryDetailPage() {
  const { projectId, storyId } = useParams<{ projectId: string; storyId: string }>()
  const { t } = useTranslation()
  const { isManager } = useRole(projectId)
  const { statuses: projectStatuses } = useProjectStatuses(projectId)
  const { addToast } = useToast()
  const location = useLocation()

  const [story, setStory] = useState<StoryResponse | null>(null)
  const [projectName, setProjectName] = useState('')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc] = useState('')

  const tasksHook = useTasks(storyId ?? '')
  const [showCreateTask, setShowCreateTask] = useState(false)

  useEffect(() => {
    if ((location.state as { modal?: string } | null)?.modal === 'create-task') {
      setShowCreateTask(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
  const [editTask, setEditTask] = useState<{ id: string; title: string; description: string } | null>(null)
  const [savingTask, setSavingTask] = useState(false)
  const [editingTaskField, setEditingTaskField] = useState<{ id: string; field: 'status' | 'priority' } | null>(null)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    if (!storyId) return
    let cancelled = false
    setLoading(true)
    const fetches: Promise<unknown>[] = [
      storiesApi.get(storyId).then((res) => {
        if (!cancelled) {
          setStory(res.data)
          setDesc(res.data.description ?? '')
        }
      }),
    ]
    if (projectId) {
      fetches.push(projectsApi.get(projectId).then((p) => { if (!cancelled) setProjectName(p.data.name) }))
      fetches.push(projectsApi.listMembers(projectId).then((m) => { if (!cancelled) setMembers(m.data) }))
    }
    Promise.all(fetches).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [storyId, projectId])

  const handleStatusChange = async (status: Status) => {
    if (!storyId) return
    try {
      const res = await storiesApi.update(storyId, { status })
      setStory(res.data)
      setEditingStatus(false)
      addToast(t('stories.status_updated'))
    } catch {
      addToast(t('errors.generic'), 'error')
    }
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!storyId) return
    try {
      const res = await storiesApi.update(storyId, { priority })
      setStory(res.data)
      setEditingPriority(false)
      addToast(t('stories.priority_updated'))
    } catch {
      addToast(t('errors.generic'), 'error')
    }
  }

  const handleSaveDesc = async () => {
    if (!storyId) return
    const res = await storiesApi.update(storyId, { description: desc })
    setStory(res.data)
    setEditingDesc(false)
    addToast(t('stories.description_saved'))
  }

  const handleTaskFieldChange = async (taskId: string, field: 'status' | 'priority', value: string) => {
    try {
      await tasksApi.update(taskId, { [field]: value })
      tasksHook.refresh()
      addToast(field === 'status' ? t('tasks.status_updated') : t('tasks.priority_updated'))
    } catch {
      addToast(t('errors.save_failed'), 'error')
    } finally {
      setEditingTaskField(null)
    }
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTask) return
    setSavingTask(true)
    try {
      await tasksApi.update(editTask.id, { title: editTask.title, description: editTask.description || undefined })
      setEditTask(null)
      tasksHook.refresh()
      addToast(t('tasks.updated'))
    } finally {
      setSavingTask(false)
    }
  }

  const priorities: Priority[] = ['low', 'medium', 'high']

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-6 pb-4">
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )
  if (!story) return null

  const sortedTasks = [...tasksHook.items].sort((a, b) => {
    const c = applySortField(a, b, sortField)
    return sortDir === 'asc' ? c : -c
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-7 pt-5 pb-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="flex items-center gap-2 text-[11.5px] text-stone-500 mb-2">
          <Link to="/projects" className="hover:text-stone-800 dark:hover:text-stone-200">{t('projects.title')}</Link>
          <span>/</span>
          <Link to={`/projects/${projectId}?tab=stories`} className="hover:text-stone-800 dark:hover:text-stone-200">{projectName || '…'}</Link>
          <span>/</span>
          <span>{story.title}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold tracking-tight">{story.title}</h1>
            <div className="flex items-center gap-3 mt-3">
              {story.is_default ? (
                <StatusPill status={story.status} statuses={projectStatuses} />
              ) : editingStatus ? (
                <select
                  autoFocus
                  defaultValue={story.status}
                  onChange={(e) => handleStatusChange(e.target.value as Status)}
                  onBlur={() => setEditingStatus(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {projectStatuses.map((ps) => (
                    <option key={ps.slug} value={ps.slug}>{ps.name}</option>
                  ))}
                </select>
              ) : (
                <button onClick={() => setEditingStatus(true)}><StatusPill status={story.status} statuses={projectStatuses} /></button>
              )}
              {story.is_default ? (
                <PriorityBars priority={story.priority} withLabel />
              ) : editingPriority ? (
                <select
                  autoFocus
                  defaultValue={story.priority}
                  onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                  onBlur={() => setEditingPriority(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
              ) : (
                <button onClick={() => setEditingPriority(true)}>
                  <PriorityBars priority={story.priority} withLabel />
                </button>
              )}
              <span className="text-[11.5px] text-stone-400">{formatRelative(story.created_at)}</span>
            </div>
          </div>
          <button
            onClick={() => setShowCreateTask(true)}
            className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5 shrink-0"
          >
            <IPlus /> {t('tasks.create')}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] min-h-0">
        {/* Main column */}
        <div className="px-7 py-5 space-y-8 overflow-y-auto">
          {/* Description */}
          <section>
            <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200 mb-2">{t('detail.description')}</h2>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
              {editingDesc ? (
                <div className="space-y-2">
                  <MarkdownEditor value={desc} onChange={setDesc} rows={10} autoExpand maxHeight="calc(100vh - 240px)" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md">{t('actions.save')}</button>
                    <button onClick={() => { setEditingDesc(false); setDesc(story.description ?? '') }} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingDesc(true)} className="w-full text-left">
                  {story.description
                    ? <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{story.description}</ReactMarkdown></div>
                    : <p className="text-[13px] text-stone-400 italic">{t('detail.add_description')}</p>}
                </button>
              )}
            </div>
          </section>

          {/* Tasks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200">
                {t('tasks.title')} <span className="text-stone-400 font-normal ml-1">{tasksHook.items.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  <option value="created_at">{t('sort.created')}</option>
                  <option value="status">{t('sort.status')}</option>
                  <option value="priority">{t('sort.priority')}</option>
                  <option value="title">{t('sort.title')}</option>
                </select>
                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            {tasksHook.items.length === 0 ? (
              <EmptyState
                message={t('tasks.empty')}
                action={isManager ? { label: t('tasks.create'), onClick: () => setShowCreateTask(true) } : undefined}
              />
            ) : (
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800/80">
                {sortedTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50/80 dark:hover:bg-stone-800/50">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/stories/${storyId}/tasks/${task.id}`}
                        className="text-[13px] font-medium hover:accent-text"
                      >
                        {task.title}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingTaskField?.id === task.id && editingTaskField.field === 'priority' ? (
                        <select
                          autoFocus
                          defaultValue={task.priority}
                          onChange={(e) => handleTaskFieldChange(task.id, 'priority', e.target.value)}
                          onBlur={() => setEditingTaskField(null)}
                          className="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                        >
                          {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setEditingTaskField({ id: task.id, field: 'priority' })}>
                          <PriorityBars priority={task.priority} />
                        </button>
                      )}
                      {editingTaskField?.id === task.id && editingTaskField.field === 'status' ? (
                        <select
                          autoFocus
                          defaultValue={task.status}
                          onChange={(e) => handleTaskFieldChange(task.id, 'status', e.target.value)}
                          onBlur={() => setEditingTaskField(null)}
                          className="text-[11px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                        >
                          {projectStatuses.map((ps) => (
                            <option key={ps.slug} value={ps.slug}>{ps.name}</option>
                          ))}
                        </select>
                      ) : (
                        <button onClick={() => setEditingTaskField({ id: task.id, field: 'status' })}>
                          <StatusPill status={task.status} statuses={projectStatuses} />
                        </button>
                      )}
                      {task.assignee_id && (() => {
                        const m = members.find(m => m.user_id === task.assignee_id)
                        if (!m) return null
                        return (
                          <span title={m.name} className="inline-flex items-center justify-center w-5 h-5 rounded-full av-2 text-white text-[9px] font-semibold">{initials(m.name)}</span>
                        )
                      })()}
                      <span className="text-[11px] text-stone-400 w-10 text-right">{formatRelative(task.created_at)}</span>
                      {isManager && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditTask({ id: task.id, title: task.title, description: task.description ?? '' })}
                            className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                          >
                            {t('actions.edit')}
                          </button>
                          <button onClick={() => setDeleteTaskId(task.id)} className="text-[11px] text-rose-400 hover:text-rose-600">
                            {t('actions.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tasksHook.nextCursor && <LoadMoreButton onLoadMore={tasksHook.loadMore} isLoading={tasksHook.isLoading} />}
          </section>

          {/* Comments */}
          <section>
            <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200 mb-3">{t('comments.title')}</h2>
            <CommentList itemType="story" itemId={storyId!} />
          </section>
        </div>

        {/* Right rail */}
        <aside className="border-l border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/30 px-5 py-5 space-y-5 text-[12.5px]">
          <DetailField label={t('detail.status')}>
            <select
              value={story.status}
              onChange={(e) => handleStatusChange(e.target.value as Status)}
              disabled={story.is_default}
              className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {projectStatuses.map((ps) => (
                <option key={ps.slug} value={ps.slug}>{ps.name}</option>
              ))}
            </select>
          </DetailField>
          <DetailField label={t('detail.priority')}>
            <select
              value={story.priority}
              onChange={(e) => handlePriorityChange(e.target.value as Priority)}
              disabled={story.is_default}
              className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </DetailField>
          <DetailField label={t('detail.project')}><span className="text-stone-700 dark:text-stone-200">{projectName}</span></DetailField>
          <DetailField label={t('detail.created')}><span className="text-stone-500">{formatRelative(story.created_at)}</span></DetailField>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-stone-400 mb-2 font-medium">{t('history.title')}</div>
            <StatusHistoryTimeline itemType="story" itemId={storyId!} statuses={projectStatuses} />
          </div>
        </aside>
      </div>

      {/* Modals */}
      {showCreateTask && (
        <CreateTaskModal
          projectId={projectId!}
          defaultStoryId={storyId}
          onCreated={() => {
            tasksHook.refresh()
            setShowCreateTask(false)
          }}
          onClose={() => setShowCreateTask(false)}
        />
      )}

      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-md w-full mx-4">
            <h3 className="text-[15px] font-semibold mb-4">{t('actions.edit')}</h3>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <input
                type="text"
                value={editTask.title}
                onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
              <MarkdownEditor value={editTask.description} onChange={(v) => setEditTask({ ...editTask, description: v })} rows={3} autoExpand />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditTask(null)} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={savingTask} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md disabled:opacity-50">
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
            addToast(t('tasks.deleted'))
          }}
          onCancel={() => setDeleteTaskId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
