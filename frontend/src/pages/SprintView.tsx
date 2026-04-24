import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { sprintsApi, tasksApi, projectsApi } from '../services/api'
import type { SprintResponse, TaskResponse, ProjectStatusResponse } from '../services/api'
import { useProjectSprints } from '../hooks/useProjectSprints'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useRole } from '../hooks/useRole'
import { useToast } from '../context/ToastContext'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { EmptyState } from '../components/common/EmptyState'

const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

const IChevron = ({ open }: { open: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
  >
    <path d="M6 9l6 6 6-6"/>
  </svg>
)

function formatDateRange(start: string, end: string, locale: string): string {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function TaskRow({
  task,
  effortUnit,
  statuses,
}: {
  task: TaskResponse
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
}) {
  const href = task.story_id ? `/stories/${task.story_id}/tasks/${task.id}` : `/tasks/${task.id}`
  return (
    <Link
      to={href}
      className="flex items-center gap-3 px-4 py-2 pl-8 hover:bg-stone-50/80 dark:hover:bg-stone-800/50 border-t border-stone-100 dark:border-stone-800/60 first:border-t-0"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <PriorityBars priority={task.priority} />
        <span className="text-[12.5px] text-stone-700 dark:text-stone-300 truncate">{task.title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {task.effort !== null && effortUnit && (
          <span className="text-[11px] bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">
            {task.effort} {effortUnit}
          </span>
        )}
        <StatusPill status={task.status} statuses={statuses} />
      </div>
    </Link>
  )
}

function SprintCard({
  sprint,
  tasks,
  effortUnit,
  statuses,
  isManager,
  locale,
  onDelete,
}: {
  sprint: SprintResponse
  tasks: TaskResponse[]
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  isManager: boolean
  locale: string
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)

  const isOverCapacity =
    sprint.capacity !== null && sprint.total_effort > sprint.capacity

  let effortLabel = ''
  if (effortUnit) {
    if (sprint.capacity !== null) {
      effortLabel = t('sprints.effort_of', {
        used: sprint.total_effort,
        capacity: sprint.capacity,
      }) + ` ${effortUnit}`
    } else if (sprint.total_effort > 0) {
      effortLabel = `${sprint.total_effort} ${effortUnit}`
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40 select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-stone-400">
          <IChevron open={open} />
        </span>
        <span className="text-[13.5px] font-medium flex-1 min-w-0 truncate">{sprint.name}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11.5px] text-stone-400">
            {formatDateRange(sprint.start_date, sprint.end_date, locale)}
          </span>
          {effortLabel && (
            <span className="text-[11.5px] text-stone-500">{effortLabel}</span>
          )}
          {isOverCapacity && (
            <span className="text-[10.5px] font-medium bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full">
              {t('sprints.over_capacity')}
            </span>
          )}
          <span className="text-[11px] text-stone-400 tabular-nums">
            {sprint.task_count} {t('tasks.title').toLowerCase()}
          </span>
          {isManager && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(sprint.id)
              }}
              className="text-[11px] text-rose-400 hover:text-rose-600"
            >
              {t('actions.delete')}
            </button>
          )}
        </div>
      </div>

      {/* Task rows */}
      {open && (
        <div className="border-t border-stone-100 dark:border-stone-800">
          {tasks.length === 0 ? (
            <p className="px-4 py-3 pl-8 text-[12px] text-stone-400 italic">
              {t('tasks.empty')}
            </p>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                effortUnit={effortUnit}
                statuses={statuses}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function SprintView({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || navigator.language
  const { sprints, loading: sprintsLoading, refresh } = useProjectSprints(projectId)
  const { statuses } = useProjectStatuses(projectId)
  const { isManager } = useRole(projectId)
  const { addToast } = useToast()

  const [allTasks, setAllTasks] = useState<TaskResponse[]>([])
  const [effortUnit, setEffortUnit] = useState<string | null>(null)
  const [tasksLoading, setTasksLoading] = useState(true)

  // Create sprint modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete confirmation
  const [deleteSprintId, setDeleteSprintId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    setTasksLoading(true)
    Promise.all([
      // Sprint view loads up to 500 tasks; projects with more tasks will show truncated rows
      // (sprint effort totals remain accurate as they are computed server-side)
      tasksApi.listForProject(projectId, { limit: 500 }),
      projectsApi.get(projectId),
    ])
      .then(([taskRes, projectRes]) => {
        setAllTasks(taskRes.data.items)
        setEffortUnit(projectRes.data.effort_unit ?? null)
      })
      .catch(() => {
        addToast('Failed to load sprint data', 'error')
        setAllTasks([])
      })
      .finally(() => setTasksLoading(false))
  }, [projectId, addToast])

  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await sprintsApi.create(projectId, {
        name: newName,
        start_date: newStartDate,
        end_date: newEndDate,
        capacity: newCapacity ? Number(newCapacity) : null,
      })
      setShowCreate(false)
      setNewName('')
      setNewStartDate('')
      setNewEndDate('')
      setNewCapacity('')
      refresh()
      addToast('Sprint created', 'success')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteSprint = async () => {
    if (!deleteSprintId) return
    try {
      await sprintsApi.delete(deleteSprintId)
      refresh()
    } catch {
      addToast('Failed to delete sprint', 'error')
    } finally {
      setDeleteSprintId(null)
    }
  }

  const sprintTaskMap: Record<string, TaskResponse[]> = {}
  const unassignedTasks: TaskResponse[] = []

  for (const task of allTasks) {
    if (task.sprint_id) {
      if (!sprintTaskMap[task.sprint_id]) sprintTaskMap[task.sprint_id] = []
      sprintTaskMap[task.sprint_id].push(task)
    } else {
      unassignedTasks.push(task)
    }
  }

  const isLoading = sprintsLoading || tasksLoading

  return (
    <div className="flex-1 px-7 py-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200">
          {t('sprints.title')}
          <span className="text-stone-400 font-normal ml-2">{sprints.length}</span>
        </h2>
        {isManager && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
          >
            <IPlus /> {t('sprints.create')}
          </button>
        )}
      </div>

      {/* Sprint list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 animate-pulse"
            />
          ))}
        </div>
      ) : sprints.length === 0 && unassignedTasks.length === 0 ? (
        <EmptyState
          message={t('sprints.empty')}
          action={
            isManager ? { label: t('sprints.create'), onClick: () => setShowCreate(true) } : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {sprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              tasks={sprintTaskMap[sprint.id] ?? []}
              effortUnit={effortUnit}
              statuses={statuses}
              isManager={isManager}
              locale={locale}
              onDelete={setDeleteSprintId}
            />
          ))}

          {/* Unassigned tasks section */}
          {unassignedTasks.length > 0 && (
            <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                <span className="text-[13px] font-medium text-stone-500 dark:text-stone-400 italic">
                  {t('sprints.unassigned')}
                </span>
                <span className="ml-2 text-[11px] text-stone-400 tabular-nums">{unassignedTasks.length}</span>
              </div>
              {unassignedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  effortUnit={effortUnit}
                  statuses={statuses}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Sprint Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 w-[min(90vw,_480px)] mx-4">
            <h3 className="text-[15px] font-semibold mb-5">{t('sprints.create')}</h3>
            <form onSubmit={handleCreateSprint} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-stone-500">{t('sprints.name')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                  placeholder={t('sprints.name')}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11.5px] font-medium text-stone-500">{t('sprints.start_date')}</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11.5px] font-medium text-stone-500">{t('sprints.end_date')}</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-stone-500">{t('sprints.capacity_optional')}</label>
                <input
                  type="number"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  min="0"
                  placeholder={t('sprints.capacity_optional')}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false)
                    setNewName('')
                    setNewStartDate('')
                    setNewEndDate('')
                    setNewCapacity('')
                  }}
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
      )}

      {/* Delete confirmation */}
      {deleteSprintId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={`Delete sprint "${sprints.find((s) => s.id === deleteSprintId)?.name ?? ''}"?`}
          onConfirm={handleDeleteSprint}
          onCancel={() => setDeleteSprintId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
