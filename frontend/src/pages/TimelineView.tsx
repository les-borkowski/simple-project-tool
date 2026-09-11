import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timelineApi, sprintsApi } from '../services/api'
import type { TimelineTask, Priority } from '../services/api'
import { EmptyState } from '../components/common/EmptyState'
import { useToast } from '../context/ToastContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useTimelineMetrics } from '../hooks/useTimelineMetrics'
import { useEscapeKey } from '../hooks/useEscapeKey'

const PRIORITY_COLOURS: Record<Priority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#ef4444',
}

const ROW_HEIGHT = 32   // px per stacked task sub-row

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function formatDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

interface PlacedTask {
  task: TimelineTask
  row: number       // which sub-row within the group (0-based)
  startPx: number
  widthPx: number
}

// Assign tasks to sub-rows to avoid overlap (calendar-style stacking)
function assignRows(tasks: TimelineTask[], rangeStart: Date, dayWidth: number): PlacedTask[] {
  const placed: PlacedTask[] = []
  const rowEnds: number[] = []   // rightmost pixel used in each sub-row

  for (const task of tasks) {
    const startPx = daysBetween(rangeStart, parseDate(task.bar_start)) * dayWidth
    const endPx = daysBetween(rangeStart, parseDate(task.bar_end)) * dayWidth
    const widthPx = Math.max(endPx - startPx, dayWidth)  // min 1 day wide

    let row = rowEnds.findIndex((end) => end <= startPx)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = startPx + widthPx + 4  // 4px gap between bars

    placed.push({ task, row, startPx, widthPx })
  }
  return placed
}

interface Group {
  label: string
  tasks: TimelineTask[]
}

// Group tasks by sprint_id; unassigned tasks go last
function buildGroups(items: TimelineTask[], sprintNames: Map<string, string>, unassignedLabel: string): Group[] {
  const bySprintId = new Map<string | null, TimelineTask[]>()
  for (const item of items) {
    const key = item.sprint_id
    if (!bySprintId.has(key)) bySprintId.set(key, [])
    bySprintId.get(key)!.push(item)
  }
  const groups: Group[] = []
  for (const [sprintId, tasks] of bySprintId) {
    if (sprintId !== null) {
      groups.push({ label: sprintNames.get(sprintId) ?? 'Sprint', tasks })
    }
  }
  const unassigned = bySprintId.get(null)
  if (unassigned) groups.push({ label: unassignedLabel, tasks: unassigned })
  return groups
}

interface TooltipProps {
  task: TimelineTask
  id: string
}

function Tooltip({ task, id }: TooltipProps) {
  const { t } = useTranslation()
  const sourceLabel: Record<string, string> = {
    deadline: t('timeline.source_deadline'),
    sprint: t('timeline.source_sprint'),
    status_history: t('timeline.source_history'),
  }
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute z-50 bottom-full mb-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-ui-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none whitespace-nowrap"
    >
      <div className="font-medium mb-0.5">{task.title}</div>
      <div className="text-stone-300 dark:text-stone-600">{task.status} · {task.priority}</div>
      <div className="mt-0.5 opacity-70">{sourceLabel[task.source]}</div>
    </div>
  )
}

export function TimelineView({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || navigator.language
  const { addToast } = useToast()

  const { dayWidth, leftCol } = useTimelineMetrics()
  const isFinePointer = useMediaQuery('(pointer: fine)')
  const tooltipBaseId = useId()

  const [items, setItems] = useState<TimelineTask[]>([])
  const [truncated, setTruncated] = useState(false)
  const [sprintNames, setSprintNames] = useState<Map<string, string>>(new Map())
  // The projectId the currently-held items/sprintNames were loaded for.
  // Compared against `projectId` below to derive loading.
  const [loadedTarget, setLoadedTarget] = useState<string | null>(null)
  // Derived, not stored: the request starts during render-triggered effect
  // work, so there is no legal point to write `loading = true` from.
  const loading = !!projectId && loadedTarget !== projectId
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const openBarRef = useRef<HTMLButtonElement | null>(null)

  // Clears both the tap-latched and hover-transient tooltip state. Shared by
  // the outside-click and Escape handlers below so a click's synthetic
  // pointer movement (which can leave hoveredId set) never leaves a tooltip
  // visible after either close path fires.
  const closeTooltip = useCallback(() => {
    setOpenId(null)
    setHoveredId(null)
  }, [])

  // Outside-click closes the tapped-open tooltip, same mechanism as Menu
  // (src/components/common/Menu.tsx): a document-level mousedown listener
  // that only closes when the click lands outside the currently open bar.
  useEffect(() => {
    if (openId === null) return
    function handlePointerDown(e: MouseEvent) {
      if (!(e.target instanceof Node)) return
      if (openBarRef.current?.contains(e.target)) return
      closeTooltip()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openId, closeTooltip])

  // Repo-wide topmost-only Escape stack (src/hooks/useEscapeKey.ts), rather
  // than a private keydown listener that could fight other overlays.
  useEscapeKey(openId !== null, closeTooltip)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    Promise.all([
      timelineApi.get(projectId),
      sprintsApi.list(projectId),
    ])
      .then(([tlResp, sprintsResp]) => {
        if (cancelled) return
        setItems(tlResp.data.items)
        setTruncated(tlResp.data.truncated)
        const nameMap = new Map<string, string>()
        for (const s of sprintsResp.data) {
          nameMap.set(s.id, s.name)
        }
        setSprintNames(nameMap)
      })
      .catch(() => {
        if (cancelled) return
        addToast(t('timeline.failed_load'), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoadedTarget(projectId)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, addToast])

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (items.length === 0) return { rangeStart: new Date(), rangeEnd: new Date(), totalDays: 30 }
    const starts = items.map(i => parseDate(i.bar_start))
    const ends = items.map(i => parseDate(i.bar_end))
    const minD = new Date(Math.min(...starts.map(d => d.getTime())))
    const maxD = new Date(Math.max(...ends.map(d => d.getTime())))
    minD.setDate(minD.getDate() - 7)   // 7-day left padding
    maxD.setDate(maxD.getDate() + 7)   // 7-day right padding
    return { rangeStart: minD, rangeEnd: maxD, totalDays: daysBetween(minD, maxD) }
  }, [items])

  // Weekly date axis ticks
  const axisTicks: Date[] = useMemo(() => {
    const ticks: Date[] = []
    const d = new Date(rangeStart)
    while (d <= rangeEnd) {
      ticks.push(new Date(d))
      d.setDate(d.getDate() + 7)
    }
    return ticks
  }, [rangeStart, rangeEnd])

  const groups = useMemo(() => buildGroups(items, sprintNames, t('common.unassigned')), [items, sprintNames, t])

  if (loading) {
    return <div className="p-6 text-ui-md text-stone-400">Loading…</div>
  }
  if (items.length === 0) {
    return <EmptyState message={t('timeline.empty')} />
  }

  const canvasWidth = totalDays * dayWidth

  return (
    <div className="p-6">
      <h2 className="text-ui-xl font-semibold mb-4">{t('timeline.title')}</h2>
      {truncated && (
        <div className="mb-3 px-3 py-2 text-ui-sm rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
          {t('timeline.truncated_warning')}
        </div>
      )}
      <div className="overflow-x-auto scroll-fade-x-r border border-stone-200 dark:border-stone-800 rounded-lg">
        <div style={{ minWidth: leftCol + canvasWidth }}>
          {/* Date axis */}
          <div className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900">
            <div
              style={{ width: leftCol }}
              className="sticky left-0 z-10 shrink-0 px-3 py-2 text-ui-2xs font-medium text-stone-400 uppercase tracking-wider bg-stone-50 dark:bg-stone-900"
            >
              Task
            </div>
            <div className="relative flex-1" style={{ height: 28 }}>
              {axisTicks.map((tick, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 text-ui-2xs text-stone-400"
                  style={{ left: daysBetween(rangeStart, tick) * dayWidth }}
                >
                  {formatDay(tick, locale)}
                </span>
              ))}
            </div>
          </div>

          {/* Groups */}
          {groups.map((group, gi) => {
            const placed = assignRows(group.tasks, rangeStart, dayWidth)
            const rowCount = Math.max(...placed.map(p => p.row + 1), 1)
            const groupHeight = rowCount * ROW_HEIGHT

            return (
              <div key={gi} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                {/* Group label row */}
                <div className="flex items-center bg-stone-50/50 dark:bg-stone-900/50 px-3 py-1.5 border-b border-stone-100 dark:border-stone-800">
                  <span
                    className="sticky left-0 z-10 text-ui-xs font-semibold text-stone-500 uppercase tracking-wider bg-stone-50 dark:bg-stone-900"
                    style={{ width: leftCol - 12 }}
                  >
                    {group.label}
                  </span>
                </div>

                {/* Title column + bar canvas */}
                <div className="flex">
                  {/* Left: task titles */}
                  <div
                    style={{ width: leftCol }}
                    className="sticky left-0 z-10 shrink-0 border-r border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-950"
                  >
                    {placed.map(({ task, row }) => (
                      <div
                        key={task.task_id}
                        className="flex items-center gap-2 px-3 text-ui-sm truncate"
                        style={{ height: ROW_HEIGHT, marginTop: row === 0 ? 0 : undefined }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PRIORITY_COLOURS[task.priority] }}
                        />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>

                  {/* Right: bar canvas */}
                  <div
                    className="relative"
                    style={{ width: canvasWidth, height: groupHeight }}
                  >
                    {placed.map(({ task, row, startPx, widthPx }) => {
                      const isOpen = openId === task.task_id || hoveredId === task.task_id
                      const tooltipId = `${tooltipBaseId}-${task.task_id}`
                      return (
                        <button
                          key={task.task_id}
                          type="button"
                          ref={openId === task.task_id ? openBarRef : undefined}
                          aria-label={task.title}
                          aria-describedby={isOpen ? tooltipId : undefined}
                          className="absolute flex items-center bg-transparent border-0 p-0 m-0 cursor-pointer"
                          style={{
                            left: startPx,
                            top: row * ROW_HEIGHT + 6,
                            height: ROW_HEIGHT - 12,
                          }}
                          onClick={() => setOpenId((prev) => (prev === task.task_id ? null : task.task_id))}
                          onMouseEnter={() => {
                            if (isFinePointer) setHoveredId(task.task_id)
                          }}
                          onMouseLeave={() => {
                            if (isFinePointer) setHoveredId(null)
                          }}
                        >
                          <div
                            className={`h-full rounded ${
                              task.source === 'status_history'
                                ? 'border-2 border-dashed'
                                : ''
                            }`}
                            style={{
                              width: widthPx,
                              backgroundColor: PRIORITY_COLOURS[task.priority] + '33',
                              borderColor:
                                task.source === 'status_history'
                                  ? PRIORITY_COLOURS[task.priority]
                                  : undefined,
                            }}
                          />
                          {isOpen && (
                            <div className="relative">
                              <Tooltip task={task} id={tooltipId} />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
