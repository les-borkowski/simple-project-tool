import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  closestCenter,
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
import { sprintsApi, tasksApi, projectsApi, isDemoBlockedError } from '../services/api'
import type { SprintResponse, TaskResponse, ProjectStatusResponse } from '../services/api'
import { useProjectSprints } from '../hooks/useProjectSprints'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useRole } from '../hooks/useRole'
import { useDragSensors } from '../hooks/useDragSensors'
import { useToast } from '../context/ToastContext'
import { Menu, MenuItem } from '../components/common/Menu'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { EmptyState } from '../components/common/EmptyState'
import { Modal } from '../components/common/Modal'
import { taskHref } from '../utils/links'

const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)

const IAssignSprint = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
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
        <span className="text-ui-md text-stone-700 dark:text-stone-300 truncate">{task.title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {task.effort !== null && effortUnit && (
          <span className="text-ui-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">
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
  sprints,
  onAssignSprint,
  dragOverlay,
}: {
  task: TaskResponse
  sprintId: string | null
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  sprints: SprintResponse[]
  onAssignSprint: (taskId: string, destSprintId: string | null) => void
  dragOverlay?: boolean
}) {
  const { t } = useTranslation()
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
  const otherSprints = sprints.filter((s) => s.id !== task.sprint_id)
  return (
    <div
      ref={setNodeRef}
      className="drag-row flex items-center gap-3 px-4 py-2 pl-8 hover:bg-stone-50/80 dark:hover:bg-stone-800/50 border-t border-stone-100 dark:border-stone-800/60 first:border-t-0"
      style={dragOverlay ? undefined : style}
      {...attributes}
      {...listeners}
    >
      <Link to={href} className="flex-1 min-w-0 flex items-center gap-2">
        <PriorityBars priority={task.priority} />
        <span className="text-ui-md text-stone-700 dark:text-stone-300 truncate">{task.title}</span>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {task.effort !== null && effortUnit && (
          <span className="text-ui-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 px-1.5 py-0.5 rounded">
            {task.effort} {effortUnit}
          </span>
        )}
        <StatusPill status={task.status} statuses={statuses} />
        {/* Tap-pill-to-edit idiom (T07): non-drag fallback for reassigning a
            task's sprint. This sits as a *sibling* of the <Link> above rather
            than nested inside it — a <button> descendant of an <a> is invalid
            content per the HTML spec and real browsers get confused about
            which element owns Enter/Space activation, so keyboard users could
            never open the menu even though a jsdom test (which activates the
            button directly via .focus(), bypassing real tab order and native
            nested-control quirks) didn't catch it. The wrapping span only
            needs to stop Enter/Space from bubbling to the row's drag-listener
            wrapper, whose sortable keyboard handling would otherwise treat
            them as a drag-activation key; every other key (notably Escape,
            which the open Menu listens for on `document`) must keep bubbling. */}
        <span
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
          }}
        >
          <Menu
            trigger={
              <button
                aria-label={t('sprints.assign_sprint')}
                className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400"
              >
                <IAssignSprint />
              </button>
            }
          >
            {otherSprints.map((s) => (
              <MenuItem key={s.id} onSelect={() => onAssignSprint(task.id, s.id)}>
                {s.name}
              </MenuItem>
            ))}
            {task.sprint_id !== null && (
              <MenuItem onSelect={() => onAssignSprint(task.id, null)}>
                {t('sprints.no_sprint')}
              </MenuItem>
            )}
          </Menu>
        </span>
      </div>
    </div>
  )
}

function SprintCard({
  sprint,
  tasks,
  effortUnit,
  statuses,
  sprints,
  onAssignSprint,
  isManager,
  sortable,
  locale,
  onDelete,
}: {
  sprint: SprintResponse
  tasks: TaskResponse[]
  effortUnit: string | null
  statuses: ProjectStatusResponse[]
  sprints: SprintResponse[]
  onAssignSprint: (taskId: string, destSprintId: string | null) => void
  isManager: boolean
  sortable: boolean
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
          className="text-ui-lg font-medium flex-1 min-w-0 truncate hover:accent-text"
          onClick={(e) => e.stopPropagation()}
        >{sprint.name}</Link>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-ui-sm text-stone-400">
            {formatDateRange(sprint.start_date, sprint.end_date, locale)}
          </span>
          {effortLabel && (
            <span className="text-ui-sm text-stone-500">{effortLabel}</span>
          )}
          {isOverCapacity && (
            <span className="text-ui-xs font-medium bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full">
              {t('sprints.over_capacity')}
            </span>
          )}
          <span className="text-ui-xs text-stone-400 tabular-nums">
            {/* Derived from the live `tasks` prop rather than the fetched
                `sprint.task_count` field (T07 review, finding 4): reassigning
                a task via the tap-menu or drag updates `allTasks` in
                SprintView's state immediately, but never refetches the
                sprints list, so `sprint.task_count` itself would stay stuck
                at whatever it was when the page loaded. */}
            {tasks.length} {t('tasks.title').toLowerCase()}
          </span>
          {isManager && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(sprint.id)
              }}
              className="text-ui-xs text-rose-400 hover:text-rose-600"
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
              className={`px-4 py-3 pl-8 text-ui-sm text-stone-400 italic transition-colors${
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
                  sprints={sprints}
                  onAssignSprint={onAssignSprint}
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
  // The projectId the currently-held tasks/effortUnit were loaded for.
  // Compared against `projectId` below to derive tasksLoading.
  const [loadedTasksFor, setLoadedTasksFor] = useState<string | null>(null)
  // Derived, not stored: the request starts during render-triggered effect
  // work, so there is no legal point to write `tasksLoading = true` from.
  const tasksLoading = !!projectId && loadedTasksFor !== projectId
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

  const sensors = useDragSensors()

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    Promise.all([
      // Sprint view loads up to 500 tasks; projects with more tasks will show truncated rows
      // (sprint effort totals remain accurate as they are computed server-side)
      tasksApi.listForProject(projectId, { limit: 500 }),
      projectsApi.get(projectId),
    ])
      .then(([taskRes, projectRes]) => {
        if (cancelled) return
        setAllTasks(taskRes.data.items)
        setEffortUnit(projectRes.data.effort_unit ?? null)
      })
      .catch(() => {
        if (cancelled) return
        addToast(t('sprints.failed_load'), 'error')
        setAllTasks([])
      })
      .finally(() => {
        if (!cancelled) setLoadedTasksFor(projectId)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, addToast])

  // Single reset shared by every close path (Escape, backdrop, Cancel,
  // successful submit) so a reopened dialog never shows stale input.
  const closeCreateSprint = () => {
    setShowCreate(false)
    setNewName('')
    setNewStartDate('')
    setNewEndDate('')
    setNewCapacity('')
  }

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
      closeCreateSprint()
      refresh()
      addToast(t('sprints.created'), 'success')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteSprint = async () => {
    if (!deleteSprintId) return
    try {
      await sprintsApi.delete(deleteSprintId)
      refresh()
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('sprints.failed_delete'), 'error')
    } finally {
      setDeleteSprintId(null)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string)
  }

  // Shared by both the cross-sprint drag-and-drop move and the tap
  // reassignment menu on SortableTaskRow (T07) — one code path moves a task
  // to a (possibly different) sprint, optimistically and with rollback on
  // failure. `overTaskId` positions the moved task ahead of a specific task
  // in the destination list (used by drag); the tap path omits it and the
  // task is appended to the end.
  const moveTaskToSprint = (taskId: string, destSprintId: string | null, overTaskId?: string) => {
    const snapshot = allTasks
    const taskToMove = allTasks.find((t) => t.id === taskId)
    if (!taskToMove) return
    const sourceSprintId = taskToMove.sprint_id

    const newSourceList = allTasks
      .filter((t) => t.sprint_id === sourceSprintId && t.id !== taskId)
      .sort(byPosition)
      .map((t, i) => ({ ...t, position: i }))

    const destList = allTasks.filter((t) => t.sprint_id === destSprintId).sort(byPosition)
    const overIndex = overTaskId ? destList.findIndex((t) => t.id === overTaskId) : -1
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

    tasksApi.update(taskId, { sprint_id: destSprintId })
      .then(() => {
        tasksApi.reorder(projectId, newDestList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
        if (newSourceList.length > 0) {
          tasksApi.reorder(projectId, newSourceList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
        }
      })
      .catch((e: unknown) => {
        if (isDemoBlockedError(e)) return
        setAllTasks(snapshot)
        addToast(t('sprints.failed_move'), 'error')
      })
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
      moveTaskToSprint(active.id as string, destSprintId, over.id as string)
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
        <h2 className="text-ui-md font-medium text-stone-700 dark:text-stone-200">
          {t('sprints.title')}
          <span className="text-stone-400 font-normal ml-2">{sprints.length}</span>
        </h2>
        {isManager && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-2.5 py-1.5 text-ui-sm rounded-md accent-bg inline-flex items-center gap-1.5"
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
                sprints={sprints}
                onAssignSprint={moveTaskToSprint}
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
                  <span className="text-ui-md font-medium text-stone-500 dark:text-stone-400 italic">
                    {t('sprints.unassigned')}
                  </span>
                  <span className="ml-2 text-ui-xs text-stone-400 tabular-nums">{sortedUnassigned.length}</span>
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
                        sprints={sprints}
                        onAssignSprint={moveTaskToSprint}
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
                sprints={sprints}
                onAssignSprint={moveTaskToSprint}
                dragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Sprint Modal */}
      {showCreate && (
        <Modal
          open
          onClose={closeCreateSprint}
          title={t('sprints.create')}
          onSubmit={handleCreateSprint}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateSprint}
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
            <div className="space-y-1">
              <label htmlFor="cs-name" className="text-ui-sm font-medium text-stone-500">{t('sprints.name')}</label>
              <input
                id="cs-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                placeholder={t('sprints.name')}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="cs-start-date" className="text-ui-sm font-medium text-stone-500">{t('sprints.start_date')}</label>
                <input
                  id="cs-start-date"
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cs-end-date" className="text-ui-sm font-medium text-stone-500">{t('sprints.end_date')}</label>
                <input
                  id="cs-end-date"
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="cs-capacity" className="text-ui-sm font-medium text-stone-500">{t('sprints.capacity_optional')}</label>
              <input
                id="cs-capacity"
                type="number"
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
                min="0"
                placeholder={t('sprints.capacity_optional')}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
              />
            </div>
          </div>
        </Modal>
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
