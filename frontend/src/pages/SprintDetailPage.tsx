import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { sprintsApi, tasksApi, projectsApi } from '../services/api'
import type { SprintResponse, TaskResponse } from '../services/api'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useRole } from '../hooks/useRole'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}

const inputCls = 'text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-full'

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
    } catch {
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

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-6 pb-4">
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    </div>
  )
  if (error) return (
    <div className="flex-1 flex items-center justify-center text-[13px] text-stone-500">
      {t('errors.generic')}
    </div>
  )
  if (!sprint) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-7 pt-5 pb-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="flex items-center gap-2 text-[11.5px] text-stone-500 mb-2">
          <Link to="/projects" className="hover:text-stone-800 dark:hover:text-stone-200">{t('projects.title')}</Link>
          <span>/</span>
          <Link to={`/projects/${projectId}?tab=sprints`} className="hover:text-stone-800 dark:hover:text-stone-200">{projectName || '…'}</Link>
          <span>/</span>
          <span>{sprint.name}</span>
        </div>
        <div className="flex items-start gap-4">
          {editingName && isManager ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') { setNameDraft(sprint.name); setEditingName(false) }
              }}
              className="text-[22px] font-semibold tracking-tight leading-tight w-full bg-transparent border-b border-stone-300 dark:border-stone-600 outline-none py-0.5"
            />
          ) : (
            <h1
              className={`text-[22px] font-semibold tracking-tight leading-tight ${isManager ? 'cursor-text hover:text-stone-600 dark:hover:text-stone-300' : ''}`}
              onClick={isManager ? () => { setNameDraft(sprint.name); setEditingName(true) } : undefined}
              title={isManager ? 'Click to edit' : undefined}
            >{sprint.name}</h1>
          )}
        </div>
        <p className="text-[11.5px] text-stone-400 mt-1">{sprint.start_date} – {sprint.end_date}</p>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] min-h-0">
        {/* Main column — task list */}
        <div className="px-7 py-5 space-y-6 overflow-y-auto">
          <section>
            <h2 className="text-[13px] font-medium text-stone-700 dark:text-stone-200 mb-3">
              {t('tasks.title')} <span className="text-stone-400 font-normal ml-1">{tasks.length}</span>
            </h2>
            {tasks.length === 0 ? (
              <p className="text-[13px] text-stone-400 italic">{t('tasks.empty')}</p>
            ) : (
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800/80">
                {tasks.map((task) => {
                  const href = task.story_id
                    ? `/stories/${task.story_id}/tasks/${task.id}`
                    : `/projects/${projectId}/tasks/${task.id}`
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50/80 dark:hover:bg-stone-800/50">
                      <div className="flex-1 min-w-0">
                        <Link to={href} className="text-[13px] font-medium hover:accent-text">{task.title}</Link>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBars priority={task.priority} />
                        <StatusPill status={task.status} statuses={projectStatuses} />
                        <span className="text-[11px] text-stone-400 w-10 text-right">{formatRelative(task.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <aside className="border-l border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/30 px-5 py-5 space-y-5 text-[12.5px]">
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
        </aside>
      </div>
    </div>
  )
}
