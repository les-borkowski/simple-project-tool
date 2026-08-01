import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { sprintsApi, tasksApi, projectsApi, isDemoBlockedError } from '../services/api'
import type { SprintResponse, TaskResponse } from '../services/api'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useRole } from '../hooks/useRole'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { SkeletonCard } from '../components/common/Skeleton'
import { DetailField } from '../components/common/DetailField'
import { DetailRail } from '../components/common/DetailRail'
import { Breadcrumbs } from '../components/common/Breadcrumbs'
import type { Crumb } from '../components/common/Breadcrumbs'
import { PageHeader } from '../components/layout/PageHeader'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'

const inputCls = 'text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full'

export function SprintDetailPage() {
  const { projectId, sprintId } = useParams<{ projectId: string; sprintId: string }>()
  const { t } = useTranslation()
  const { addToast } = useToast()
  const { isManager } = useRole(projectId)
  const { statuses: projectStatuses } = useProjectStatuses(projectId)

  const [sprint, setSprint] = useState<SprintResponse | null>(null)
  const [projectName, setProjectName] = useState('')
  const [tasks, setTasks] = useState<TaskResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [startDateDraft, setStartDateDraft] = useState('')
  const [endDateDraft, setEndDateDraft] = useState('')
  const [capacityDraft, setCapacityDraft] = useState('')

  useEffect(() => {
    if (!sprintId || !projectId) return
    let cancelled = false
    Promise.all([
      sprintsApi.get(sprintId),
      tasksApi.listForProject(projectId, { sprint_id: sprintId, limit: 500 }),
      projectsApi.get(projectId),
    ]).then(([sprintRes, tasksRes, projectRes]) => {
      if (cancelled) return
      const s = sprintRes.data
      setSprint(s)
      setNameDraft(s.name)
      setStartDateDraft(s.start_date)
      setEndDateDraft(s.end_date)
      setCapacityDraft(s.capacity != null ? String(s.capacity) : '')
      setTasks(tasksRes.data.items)
      setProjectName(projectRes.data.name)
    }).catch(() => { if (!cancelled) setError(true) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sprintId, projectId])

  const patch = async (data: Parameters<typeof sprintsApi.update>[1], toast: string) => {
    if (!sprintId) return
    try {
      const res = await sprintsApi.update(sprintId, data)
      setSprint(res.data)
      addToast(toast)
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.save_failed'), 'error')
    }
  }

  const handleSaveName = async () => {
    if (!nameDraft.trim() || nameDraft === sprint?.name) { setEditingName(false); return }
    await patch({ name: nameDraft.trim() }, t('sprints.name_updated'))
    setEditingName(false)
  }

  const handleStartDateBlur = async () => {
    if (startDateDraft && startDateDraft !== sprint?.start_date)
      await patch({ start_date: startDateDraft }, t('sprints.dates_updated'))
  }

  const handleEndDateBlur = async () => {
    if (endDateDraft && endDateDraft !== sprint?.end_date)
      await patch({ end_date: endDateDraft }, t('sprints.dates_updated'))
  }

  const handleCapacityBlur = async () => {
    const parsed = capacityDraft ? parseInt(capacityDraft, 10) : null
    if (capacityDraft !== '' && (isNaN(parsed!) || parsed! < 0)) return
    const current = sprint?.capacity != null ? String(sprint.capacity) : ''
    if (capacityDraft === current) return
    await patch({ capacity: parsed }, t('sprints.capacity_updated'))
  }

  const crumbs: Crumb[] = [
    { label: t('projects.title'), to: '/projects' },
    { label: projectName || '…', to: `/projects/${projectId}?tab=sprints` },
    { label: sprint?.name ?? '' },
  ]

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <PageHeader loading title={sprint?.name ?? ''} breadcrumbs={<Breadcrumbs items={crumbs} />} subtitle={<span />} />
      <div className="px-7 py-5">
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )
  if (error) return (
    <div className="flex-1 flex items-center justify-center text-ui-md text-stone-500">
      {t('errors.generic')}
    </div>
  )
  if (!sprint) return null

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        title={sprint.name}
        onTitleClick={isManager ? () => { setNameDraft(sprint.name); setEditingName(true) } : undefined}
        titleEditor={
          editingName && isManager ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') { setNameDraft(sprint.name); setEditingName(false) }
              }}
              className="text-ui-3xl font-semibold tracking-tight w-full bg-transparent border-b border-stone-300 dark:border-stone-600 outline-none py-0.5"
            />
          ) : undefined
        }
        breadcrumbs={<Breadcrumbs items={crumbs} />}
        subtitle={`${sprint.start_date} – ${sprint.end_date}`}
      />

      {/* Two-column layout: the rail comes first in the DOM so the phone reader
          meets it before the task list, and the page scrolls as one document
          rather than nesting a scroller. The rail takes itself back to the
          right-hand track at lg. */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] min-h-0">
        {/* Right rail */}
        <DetailRail label={t('detail.details')}>
          <DetailField label={t('sprints.start_date')}>
            {isManager ? (
              <input
                type="date"
                value={startDateDraft}
                onChange={(e) => setStartDateDraft(e.target.value)}
                onBlur={handleStartDateBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className={inputCls}
              />
            ) : (
              <span className="text-stone-700 dark:text-stone-200">{sprint.start_date}</span>
            )}
          </DetailField>

          <DetailField label={t('sprints.end_date')}>
            {isManager ? (
              <input
                type="date"
                value={endDateDraft}
                onChange={(e) => setEndDateDraft(e.target.value)}
                onBlur={handleEndDateBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className={inputCls}
              />
            ) : (
              <span className="text-stone-700 dark:text-stone-200">{sprint.end_date}</span>
            )}
          </DetailField>

          <DetailField label={t('sprints.capacity')}>
            {isManager ? (
              <input
                type="number"
                min="0"
                value={capacityDraft}
                onChange={(e) => setCapacityDraft(e.target.value)}
                onBlur={handleCapacityBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                placeholder="—"
                className={inputCls}
              />
            ) : (
              <span className="text-stone-700 dark:text-stone-200">{sprint.capacity ?? '—'}</span>
            )}
          </DetailField>

          <DetailField label={t('detail.effort')}>
            <span className="text-stone-700 dark:text-stone-200">
              {sprint.capacity != null
                ? t('sprints.effort_of', { used: sprint.total_effort, capacity: sprint.capacity })
                : sprint.total_effort || '—'}
            </span>
          </DetailField>

          <DetailField label={t('detail.project')}>
            <span className="text-stone-700 dark:text-stone-200">{projectName}</span>
          </DetailField>

          <DetailField label={t('detail.created')}>
            <span className="text-stone-500">{formatRelative(sprint.created_at)}</span>
          </DetailField>
        </DetailRail>

        {/* Main column — task list */}
        <div className="px-7 py-5 space-y-6 overflow-visible lg:overflow-y-auto">
          <section>
            <h2 className="text-ui-md font-medium text-stone-700 dark:text-stone-200 mb-3">
              {t('tasks.title')} <span className="text-stone-400 font-normal ml-1">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
              <p className="text-ui-md text-stone-400 italic">{t('tasks.empty')}</p>
            ) : (
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800/80">
                {tasks.map((task) => {
                  const href = task.story_id
                    ? `/stories/${task.story_id}/tasks/${task.id}`
                    : `/projects/${projectId}/tasks/${task.id}`
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50/80 dark:hover:bg-stone-800/50">
                      <div className="flex-1 min-w-0">
                        <Link to={href} className="text-ui-md font-medium hover:accent-text">{task.title}</Link>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBars priority={task.priority} />
                        <StatusPill status={task.status} statuses={projectStatuses} />
                        <span className="text-ui-xs text-stone-400 w-10 text-right">{formatRelative(task.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
