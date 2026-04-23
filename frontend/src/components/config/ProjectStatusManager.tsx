// frontend/src/components/config/ProjectStatusManager.tsx
import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { statusesApi } from '../../services/api'
import type { ProjectStatusResponse } from '../../services/api'
import { useProjectStatuses } from '../../hooks/useProjectStatuses'

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
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDrop: (e: React.DragEvent) => void
}

function StatusRow({
  status,
  projectId,
  isManager,
  onUpdated,
  onDeleted,
  onDragStart,
  onDragOver,
  onDrop,
}: RowProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(status.name)
  const [colour, setColour] = useState(status.colour)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
      draggable={isManager}
      onDragStart={(e) => onDragStart(e, status.id)}
      onDragOver={(e) => onDragOver(e, status.id)}
      onDrop={onDrop}
      className="flex items-center gap-3 p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 group"
    >
      {/* Drag handle */}
      {isManager && (
        <span className="cursor-grab text-stone-300 dark:text-stone-600 select-none" title="Drag to reorder">
          ⠿
        </span>
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
            className="w-full text-[13px] bg-transparent border-none outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 rounded px-1 -mx-1"
            disabled={saving}
          />
        ) : (
          <span className="text-[13px]">{name}</span>
        )}
        <div className="text-[10.5px] text-stone-400 font-mono">{status.slug}</div>
      </div>

      {/* Delete */}
      {isManager && (
        confirmDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-stone-500">{t('project_statuses.delete_confirm')}</span>
            <button
              onClick={deleteStatus}
              className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700"
            >
              {t('actions.delete')}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-0.5 text-[11px] border border-stone-200 dark:border-stone-600 rounded"
            >
              {t('actions.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600 text-[11px] transition-opacity shrink-0"
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
          className="flex-1 text-[13px] bg-transparent border-none outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600 rounded px-1 -mx-1"
        />
      </div>
      {name && (
        <div className="text-[10.5px] text-stone-400 font-mono pl-8">
          {t('project_statuses.slug_label')}: {slug || slugify(name)}
        </div>
      )}
      {error && <div className="text-[11px] text-red-500 pl-8">{error}</div>}
      <div className="flex gap-2 pl-8">
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="px-3 py-1 text-[12px] accent-bg text-white rounded-md disabled:opacity-50"
        >
          {t('project_statuses.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-[12px] border border-stone-200 dark:border-stone-700 rounded-md"
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
  const { statuses, loading, refresh } = useProjectStatuses(projectId)
  const [showAdd, setShowAdd] = useState(false)
  const dragId = useRef<string | null>(null)
  const dragOverId = useRef<string | null>(null)

  const handleDragStart = (_e: React.DragEvent, id: string) => {
    dragId.current = id
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    dragOverId.current = id
  }

  const handleDrop = async (_e: React.DragEvent) => {
    if (!dragId.current || !dragOverId.current || dragId.current === dragOverId.current) return

    const from = statuses.findIndex((s) => s.id === dragId.current)
    const to = statuses.findIndex((s) => s.id === dragOverId.current)
    if (from === -1 || to === -1) return

    const reordered = [...statuses]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)

    // PATCH each status with its new order
    await Promise.all(
      reordered.map((s, idx) =>
        statusesApi.update(projectId, s.id, { order: idx })
      )
    )
    dragId.current = null
    dragOverId.current = null
    refresh()
  }

  if (loading) return <div className="text-[13px] text-stone-400">Loading…</div>

  return (
    <div className="space-y-2">
      <h3 className="text-[13px] font-medium">{t('project_statuses.title')}</h3>
      <div className="space-y-1.5">
        {statuses.map((s) => (
          <StatusRow
            key={s.id}
            status={s}
            projectId={projectId}
            isManager={isManager}
            onUpdated={refresh}
            onDeleted={refresh}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
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
          className="mt-2 text-[12.5px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1"
        >
          + {t('project_statuses.add')}
        </button>
      )}
    </div>
  )
}
