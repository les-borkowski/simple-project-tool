import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { projectsApi, tasksApi } from '../../services/api'
import type { MemberResponse, Priority, Status, TaskResponse } from '../../services/api'
import { useAuth } from '../../context/auth-context'
import { useProjectStatuses } from '../../hooks/useProjectStatuses'
import { useProjectSprints } from '../../hooks/useProjectSprints'
import { useStories } from '../../hooks/useStories'
import { MarkdownEditor } from '../common/MarkdownEditor'
import { Modal } from '../common/Modal'

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
  // null means "not chosen yet" so the field can fall back to the current
  // user. '' is a legitimate user choice (Unassigned), so it can't double as
  // that sentinel — see effectiveAssigneeId below.
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [effort, setEffort] = useState('')
  const [creating, setCreating] = useState(false)

  // Each field falls back to its default until the user picks something.
  // Previously three effects wrote these defaults into state as the data
  // arrived, which is a cascading render and what set-state-in-effect rejects.
  const effectiveStatus = taskStatus || ((statuses[0]?.slug as Status) ?? '')
  const effectiveStoryId =
    storyId ||
    defaultStoryId ||
    (storiesHook.items.find((s) => s.is_default) ?? storiesHook.items[0])?.id.toString() ||
    ''
  const effectiveAssigneeId = assigneeId ?? user?.id ?? ''

  // Fetch project members
  useEffect(() => {
    projectsApi.listMembers(projectId).then((res) => setMembers(res.data)).catch(() => {})
  }, [projectId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const data = {
        title,
        description: description || undefined,
        status: effectiveStatus,
        priority,
        assignee_id: effectiveAssigneeId || undefined,
        sprint_id: sprintId || null,
        effort: effort ? parseInt(effort, 10) : null,
      }
      const res = await tasksApi.create(effectiveStoryId, data)
      onCreated(res.data)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('tasks.create')}
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 tap-safe"
          >
            {t('actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={creating}
            className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe"
          >
            {t('actions.create')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <input
          type="text"
          placeholder={t('board.col_title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
        />
        <MarkdownEditor
          value={description}
          onChange={setDescription}
          rows={4}
          placeholder={t('tasks.description')}
          autoExpand
        />
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Status */}
          <div className="space-y-1">
            <label htmlFor="ctm-status" className="text-ui-sm font-medium text-stone-500">
              {t('filter.status')}
            </label>
            <select
              id="ctm-status"
              value={effectiveStatus}
              onChange={(e) => setTaskStatus(e.target.value as Status)}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
            >
              {statuses.map((ps) => (
                <option key={ps.slug} value={ps.slug}>{ps.name}</option>
              ))}
            </select>
          </div>
          {/* Priority */}
          <div className="space-y-1">
            <label htmlFor="ctm-priority" className="text-ui-sm font-medium text-stone-500">
              {t('filter.priority')}
            </label>
            <select
              id="ctm-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
            >
              {priorities.map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </select>
          </div>
          {/* Story - hidden when defaultStoryId is provided */}
          {!defaultStoryId && (
            <div className="space-y-1">
              <label htmlFor="ctm-story" className="text-ui-sm font-medium text-stone-500">
                {t('tasks.story')}
              </label>
              <select
                id="ctm-story"
                value={effectiveStoryId}
                onChange={(e) => setStoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
              >
                {[...storiesHook.items].sort((a, b) => a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          )}
          {/* Sprint - hidden when defaultSprintId is provided */}
          {!defaultSprintId && (
            <div className="space-y-1">
              <label htmlFor="ctm-sprint" className="text-ui-sm font-medium text-stone-500">
                {t('detail.sprint')}
              </label>
              <select
                id="ctm-sprint"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
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
            <label htmlFor="ctm-assignee" className="text-ui-sm font-medium text-stone-500">
              {t('tasks.assignee')}
            </label>
            <select
              id="ctm-assignee"
              value={effectiveAssigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
            >
              <option value="">{t('tasks.unassigned')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.name}</option>
              ))}
            </select>
          </div>
          {/* Effort */}
          <div className="space-y-1">
            <label htmlFor="ctm-effort" className="text-ui-sm font-medium text-stone-500">
              {t('detail.effort')}
            </label>
            <input
              id="ctm-effort"
              type="number"
              min="0"
              placeholder="—"
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
