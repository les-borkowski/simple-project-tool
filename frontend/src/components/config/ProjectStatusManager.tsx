// frontend/src/components/config/ProjectStatusManager.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { statusesApi, isDemoBlockedError } from '../../services/api'
import type { ProjectStatusResponse } from '../../services/api'
import { useProjectStatuses } from '../../hooks/useProjectStatuses'
import { useToast } from '../../context/ToastContext'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDragSensors } from '../../hooks/useDragSensors'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
}

interface RowProps {
  status: ProjectStatusResponse
  projectId: string
  isManager: boolean
  onUpdated: () => void
  onDeleted: () => void
  isFirst: boolean
  isLast: boolean
  reordering: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function StatusRow({
  status,
  projectId,
  isManager,
  onUpdated,
  onDeleted,
  isFirst,
  isLast,
  reordering,
  onMoveUp,
  onMoveDown,
}: RowProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(status.name)
  const [colour, setColour] = useState(status.colour)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const isDirty = name !== status.name || colour !== status.colour

  const save = async () => {
    if (!isDirty) return
    setSaving(true)
    try {
      await statusesApi.update(projectId, status.id, { name, colour })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const deleteStatus = async () => {
    await statusesApi.delete(projectId, status.id)
    onDeleted()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 group"
    >
      {/* Drag handle */}
      {isManager && (
        <span
          {...attributes}
          {...listeners}
          className="drag-handle cursor-grab text-stone-300 dark:text-stone-600"
          title="Drag to reorder"
        >
          ⠿
        </span>
      )}

      {/* Reorder buttons */}
      {isManager && (
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || reordering}
            aria-label={t('project_statuses.move_up')}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-ui-xs leading-none px-1"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || reordering}
            aria-label={t('project_statuses.move_down')}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed text-ui-xs leading-none px-1"
          >
            ▼
          </button>
        </div>
      )}

      {/* Colour swatch / picker */}
      <label className="relative cursor-pointer shrink-0" title="Change colour">
        <span
          className="block w-5 h-5 rounded-full border border-stone-200 dark:border-stone-600"
          style={{ background: colour }}
        />
        {isManager && (
          <input
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            onBlur={save}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        )}
      </label>

      {/* Name + slug */}
      <div className="flex-1 min-w-0">
        {isManager ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            className="w-full text-ui-md bg-transparent border-none outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 rounded px-1 -mx-1"
            disabled={saving}
          />
        ) : (
          <span className="text-ui-md">{name}</span>
        )}
        <div className="text-ui-xs text-stone-400 font-mono">{status.slug}</div>
      </div>

      {/* Delete */}
      {isManager && (
        confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-ui-xs text-stone-500">{t('project_statuses.delete_confirm')}</span>
            <button
              onClick={deleteStatus}
              className="px-2 py-0.5 text-ui-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              {t('actions.delete')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-0.5 text-ui-xs border border-stone-200 dark:border-stone-600 rounded"
            >
              {t('actions.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 text-stone-400 hover:text-red-600 text-ui-xs transition-opacity shrink-0"
          >
            {t('actions.delete')}
          </button>
        )
      )}
    </div>
  )
}

interface AddRowProps {
  projectId: string
  nextOrder: number
  onAdded: () => void
  onCancel: () => void
}

function AddStatusRow({ projectId, nextOrder, onAdded, onCancel }: AddRowProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#6b7280')
  const [slug, setSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNameBlur = () => {
    if (name && !slug) setSlug(slugify(name))
  }

  const save = async () => {
    if (!name.trim() || !slug.trim()) return
    setSaving(true)
    setError(null)
    try {
      await statusesApi.create(projectId, {
        slug,
        name: name.trim(),
        colour,
        order: nextOrder,
      })
      onAdded()
    } catch (e: unknown) {
      if (isDemoBlockedError(e)) return
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Failed to create status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900/50">
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer shrink-0">
          <span className="block w-5 h-5 rounded-full border border-stone-300" style={{ background: colour }} />
          <input
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </label>
        <input
          autoFocus
          placeholder={t('project_statuses.name_placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          className="flex-1 text-ui-md bg-transparent border-none outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 rounded px-1 -mx-1"
        />
      </div>
      {name && (
        <div className="text-ui-xs text-stone-400 font-mono pl-8">
          {t('project_statuses.slug_label')}: {slug || slugify(name)}
        </div>
      )}
      {error && <div className="text-ui-xs text-red-500 pl-8">{error}</div>}
      <div className="flex gap-2 pl-8">
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="px-3 py-1 text-ui-sm accent-bg text-white rounded-md disabled:opacity-50"
        >
          {t('project_statuses.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-ui-sm border border-stone-200 dark:border-stone-700 rounded-md"
        >
          {t('project_statuses.cancel')}
        </button>
      </div>
    </div>
  )
}

interface Props {
  projectId: string
  isManager: boolean
}

export function ProjectStatusManager({ projectId, isManager }: Props) {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const { statuses, loading, refresh } = useProjectStatuses(projectId)
  const [showAdd, setShowAdd] = useState(false)
  const [localStatuses, setLocalStatuses] = useState<ProjectStatusResponse[]>(statuses)
  const [reordering, setReordering] = useState(false)
  const sensors = useDragSensors()

  useEffect(() => {
    setLocalStatuses(statuses)
  }, [statuses])

  const reorder = async (newOrder: ProjectStatusResponse[]) => {
    // Serialize reorders: a second reorder cannot start while one is still
    // in flight. This avoids a race where a later, successful batch's
    // optimistic update gets clobbered by an earlier batch's failure
    // handler, and keeps the drag path and the ↑/↓ buttons on one path.
    if (reordering) return
    setReordering(true)
    setLocalStatuses(newOrder)
    try {
      await Promise.all(
        newOrder.map((s, idx) => statusesApi.update(projectId, s.id, { order: idx }))
      )
    } catch (e: unknown) {
      if (!isDemoBlockedError(e)) {
        addToast(t('errors.save_failed'), 'error')
        // A partial failure may have already committed some of the PATCHes
        // server-side, so a client-invented "previous order" would be a
        // lie. Re-sync from the server instead of rolling back locally.
        await refresh()
      }
    } finally {
      setReordering(false)
    }
  }

  const moveStatus = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= localStatuses.length) return
    reorder(arrayMove(localStatuses, index, newIndex))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localStatuses.findIndex((s) => s.id === active.id)
    const newIndex = localStatuses.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorder(arrayMove(localStatuses, oldIndex, newIndex))
  }

  if (loading) return <div className="text-ui-md text-stone-400">Loading…</div>

  return (
    <div className="space-y-2">
      <h3 className="text-ui-md font-medium">{t('project_statuses.title')}</h3>
      <div className="space-y-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localStatuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {localStatuses.map((s, idx) => (
              <StatusRow
                key={s.id}
                status={s}
                projectId={projectId}
                isManager={isManager}
                onUpdated={refresh}
                onDeleted={refresh}
                isFirst={idx === 0}
                isLast={idx === localStatuses.length - 1}
                reordering={reordering}
                onMoveUp={() => moveStatus(idx, -1)}
                onMoveDown={() => moveStatus(idx, 1)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {showAdd && (
          <AddStatusRow
            projectId={projectId}
            nextOrder={statuses.length}
            onAdded={() => { setShowAdd(false); refresh() }}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </div>
      {isManager && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2 text-ui-md text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1"
        >
          + {t('project_statuses.add')}
        </button>
      )}
    </div>
  )
}
