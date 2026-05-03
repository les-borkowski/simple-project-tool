import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { taskHref } from '../utils/links'

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

const byPosition = (a: TaskResponse, b: TaskResponse) => a.position - b.position

function TaskRow({
  task,
  effortUnit,
  statuses,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  task: TaskResponse
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
}) {
  const href = taskHref(task)
  return (
    <Link
      to={href}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-4 py-2 pl-8 hover:bg-stone-50/80 dark:hover:bg-stone-800/50 border-t border-stone-100 dark:border-stone-800/60 first:border-t-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
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

function SortableTaskRow({
  task,
  sprintId,
  effortUnit,
  statuses,
  dragOverlay,
}: {
  task: TaskResponse
  sprintId: string | null
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  dragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { sprintId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const href = taskHref(task)
  return (
    <div ref={setNodeRef} style={dragOverlay ? undefined : style} {...attributes} {...listeners}>
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
    </div>
  )
}

function SprintCard({
  sprint,
  tasks,
  effortUnit,
  statuses,
  isManager,
  sortable,
  locale,
  onDelete,
  isDragging,
  onDrop,
}: {
  sprint: SprintResponse
  tasks: TaskResponse[]
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  isManager: boolean
  sortable: boolean
  locale: string
  onDelete: (id: string) => void
  isDragging: boolean
  onDrop: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const [isOver, setIsOver] = useState(false)

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

  const sortedTasks = [...tasks].sort(byPosition)

  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
    id: `sprint-drop:${sprint.id}`,
    data: { sprintId: sprint.id },
  })

  return (
    <div
      className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden"
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40 select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-stone-400">
          <IChevron open={open} />
        </span>
        <Link
          to={`/projects/${sprint.project_id}/sprints/${sprint.id}`}
          className="text-[13.5px] font-medium flex-1 min-w-0 truncate hover:accent-text"
          onClick={(e) => e.stopPropagation()}
        >{sprint.name}</Link>
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
          {sortedTasks.length === 0 ? (
            <div
              ref={sortable ? setDropRef : undefined}
              className={`px-4 py-3 pl-8 text-[12px] text-stone-400 italic transition-colors${
                sortable && isDropOver ? ' bg-stone-50 dark:bg-stone-800/50' : ''
              }`}
            >
              {t('tasks.empty')}
            </div>
          ) : sortable ? (
            <SortableContext items={sortedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {sortedTasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  sprintId={sprint.id}
                  effortUnit={effortUnit}
                  statuses={statuses}
                />
              ))}
            </SortableContext>
          ) : (
            sortedTasks.map((task) => (
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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  // Create sprint modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete confirmation
  const [deleteSprintId, setDeleteSprintId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string)
  }

  const handleSprintDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTaskId(null)
    if (!over || active.id === over.id) return

    const sourceSprintId = (active.data.current as { sprintId: string | null } | undefined)?.sprintId ?? null
    const destSprintId = (over.data.current as { sprintId: string | null } | undefined)?.sprintId ?? null

    if (sourceSprintId === destSprintId) {
      const group = allTasks.filter((t) => t.sprint_id === sourceSprintId).sort(byPosition)
      const oldIndex = group.findIndex((t) => t.id === active.id)
      const newIndex = group.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(group, oldIndex, newIndex).map((t, i) => ({ ...t, position: i }))
      setAllTasks((prev) => [...prev.filter((t) => t.sprint_id !== sourceSprintId), ...reordered])
      tasksApi.reorder(projectId, reordered.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
    } else {
      const snapshot = allTasks
      const taskToMove = allTasks.find((t) => t.id === active.id)
      if (!taskToMove) return

      const newSourceList = allTasks
        .filter((t) => t.sprint_id === sourceSprintId && t.id !== active.id)
        .sort(byPosition)
        .map((t, i) => ({ ...t, position: i }))

      const destList = allTasks.filter((t) => t.sprint_id === destSprintId).sort(byPosition)
      const overIndex = destList.findIndex((t) => t.id === over.id)
      const insertAt = overIndex === -1 ? destList.length : overIndex
      const movedTask = { ...taskToMove, sprint_id: destSprintId }
      const newDestList = [
        ...destList.slice(0, insertAt),
        movedTask,
        ...destList.slice(insertAt),
      ].map((t, i) => ({ ...t, position: i }))

      setAllTasks((prev) => [
        ...prev.filter((t) => t.sprint_id !== sourceSprintId && t.sprint_id !== destSprintId),
        ...newSourceList,
        ...newDestList,
      ])

      tasksApi.update(active.id as string, { sprint_id: destSprintId })
        .then(() => {
          tasksApi.reorder(projectId, newDestList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
          if (newSourceList.length > 0) {
            tasksApi.reorder(projectId, newSourceList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
          }
        })
        .catch(() => {
          setAllTasks(snapshot)
          addToast('Failed to move task', 'error')
        })
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

  const sortedUnassigned = [...unassignedTasks].sort(byPosition)

  const isLoading = sprintsLoading || tasksLoading
  const activeTask = activeTaskId ? allTasks.find((t) => t.id === activeTaskId) : null

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleSprintDragEnd}
        >
          <div className="space-y-3">
            {sprints.map((sprint) => (
              <SprintCard
                key={sprint.id}
                sprint={sprint}
                tasks={sprintTaskMap[sprint.id] ?? []}
                effortUnit={effortUnit}
                statuses={statuses}
                isManager={isManager}
                sortable={isManager}
                locale={locale}
                onDelete={setDeleteSprintId}
              />
            ))}

            {/* Unassigned tasks section */}
            {sortedUnassigned.length > 0 && (
              <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                  <span className="text-[13px] font-medium text-stone-500 dark:text-stone-400 italic">
                    {t('sprints.unassigned')}
                  </span>
                  <span className="ml-2 text-[11px] text-stone-400 tabular-nums">{sortedUnassigned.length}</span>
                </div>
                {isManager ? (
                  <SortableContext items={sortedUnassigned.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {sortedUnassigned.map((task) => (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        sprintId={null}
                        effortUnit={effortUnit}
                        statuses={statuses}
                      />
                    ))}
                  </SortableContext>
                ) : (
                  sortedUnassigned.map((task) => (
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

          <DragOverlay>
            {activeTask ? (
              <SortableTaskRow
                task={activeTask}
                sprintId={null}
                effortUnit={effortUnit}
                statuses={statuses}
                dragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
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
