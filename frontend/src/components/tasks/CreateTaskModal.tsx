import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { projectsApi, tasksApi } from '../../services/api'
import type { MemberResponse, Priority, Status, TaskResponse } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useProjectStatuses } from '../../hooks/useProjectStatuses'
import { useProjectSprints } from '../../hooks/useProjectSprints'
import { useStories } from '../../hooks/useStories'
import { MarkdownEditor } from '../common/MarkdownEditor'

interface CreateTaskModalProps {
  projectId: string
  defaultStoryId?: string   // pre-selects AND hides the Story dropdown
  defaultSprintId?: string  // pre-selects AND hides the Sprint dropdown
  onCreated: (task: TaskResponse) => void
  onClose: () => void
}

const priorities: Priority[] = ['low', 'medium', 'high']

export function CreateTaskModal({
  projectId,
  defaultStoryId,
  defaultSprintId,
  onCreated,
  onClose,
}: CreateTaskModalProps) {
  const { t } = useTranslation()
  const { user } = useAuth()

  const { statuses } = useProjectStatuses(projectId)
  const { sprints } = useProjectSprints(projectId)
  const storiesHook = useStories(projectId)

  const [members, setMembers] = useState<MemberResponse[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskStatus, setTaskStatus] = useState<Status>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [storyId, setStoryId] = useState(defaultStoryId ?? '')
  const [sprintId, setSprintId] = useState(defaultSprintId ?? '')
  const [assigneeId, setAssigneeId] = useState(user?.id ?? '')
  const [effort, setEffort] = useState('')
  const [creating, setCreating] = useState(false)

  // Initialize status to first project status when loaded
  useEffect(() => {
    if (statuses.length > 0 && !taskStatus) setTaskStatus(statuses[0].slug as Status)
  }, [statuses])

  // Set default assignee to current user when user loads
  useEffect(() => {
    if (user?.id && !assigneeId) setAssigneeId(user.id)
  }, [user?.id])

  // Fetch project members
  useEffect(() => {
    projectsApi.listMembers(projectId).then((res) => setMembers(res.data)).catch(() => {})
  }, [projectId])

  // Escape key closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const data = {
        title,
        description: description || undefined,
        status: taskStatus,
        priority,
        assignee_id: assigneeId || undefined,
        sprint_id: sprintId || null,
        effort: effort ? parseInt(effort, 10) : null,
      }
      let task: TaskResponse
      if (storyId) {
        const res = await tasksApi.create(storyId, data)
        task = res.data
      } else {
        const res = await tasksApi.createForProject(projectId, data)
        task = res.data
      }
      onCreated(task)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 w-[min(90vw,_900px)] min-w-[67vw] mx-4">
        <h3 className="text-[15px] font-semibold mb-5">{t('tasks.create')}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t('board.col_title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
          />
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            rows={4}
            placeholder={t('tasks.description')}
            autoExpand
          />
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-1">
              <label htmlFor="ctm-status" className="text-[11.5px] font-medium text-stone-500">
                {t('filter.status')}
              </label>
              <select
                id="ctm-status"
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as Status)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
              >
                {statuses.map((ps) => (
                  <option key={ps.slug} value={ps.slug}>{ps.name}</option>
                ))}
              </select>
            </div>
            {/* Priority */}
            <div className="space-y-1">
              <label htmlFor="ctm-priority" className="text-[11.5px] font-medium text-stone-500">
                {t('filter.priority')}
              </label>
              <select
                id="ctm-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>{t(`priority.${p}`)}</option>
                ))}
              </select>
            </div>
            {/* Story - hidden when defaultStoryId is provided */}
            {!defaultStoryId && (
              <div className="space-y-1">
                <label htmlFor="ctm-story" className="text-[11.5px] font-medium text-stone-500">
                  {t('tasks.story')}
                </label>
                <select
                  id="ctm-story"
                  value={storyId}
                  onChange={(e) => setStoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                >
                  <option value="">{t('tasks.no_story')}</option>
                  {storiesHook.items.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Sprint - hidden when defaultSprintId is provided */}
            {!defaultSprintId && (
              <div className="space-y-1">
                <label htmlFor="ctm-sprint" className="text-[11.5px] font-medium text-stone-500">
                  {t('detail.sprint')}
                </label>
                <select
                  id="ctm-sprint"
                  value={sprintId}
                  onChange={(e) => setSprintId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                >
                  <option value="">{t('sprints.no_sprint')}</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Assignee */}
            <div className="space-y-1">
              <label htmlFor="ctm-assignee" className="text-[11.5px] font-medium text-stone-500">
                {t('tasks.assignee')}
              </label>
              <select
                id="ctm-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
              >
                <option value="">{t('tasks.unassigned')}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
            </div>
            {/* Effort */}
            <div className="space-y-1">
              <label htmlFor="ctm-effort" className="text-[11.5px] font-medium text-stone-500">
                {t('detail.effort')}
              </label>
              <input
                id="ctm-effort"
                type="number"
                min="0"
                placeholder="—"
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              {t('actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md disabled:opacity-50"
            >
              {t('actions.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
