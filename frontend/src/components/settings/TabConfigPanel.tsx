import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../context/ToastContext'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { preferencesApi } from '../../services/api'

interface TabConfigPanelProps {
  projectId: string
  tabOrder: string[]
  hiddenTabs: string[]
  onPreferencesChange: (tabOrder: string[], hiddenTabs: string[]) => void
}

interface SortableTabRowProps {
  tabKey: string
  label: string
  isHidden: boolean
  onToggle: () => void
}

function SortableTabRow({ tabKey, label, isHidden, onToggle }: SortableTabRowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tabKey })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2 px-3 rounded-md bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 mb-2"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-stone-400 cursor-grab text-lg leading-none select-none"
      >
        ⠿
      </span>
      <span className="flex-1 text-[13px]">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`text-[11px] px-2 py-0.5 rounded-md border ${isHidden ? 'border-stone-200 dark:border-stone-700 text-stone-400' : 'border-stone-400 text-stone-600 dark:text-stone-300'}`}
      >
        {isHidden ? t('tabs.hidden') : t('tabs.visible')}
      </button>
    </div>
  )
}

export function TabConfigPanel({ projectId, tabOrder, hiddenTabs, onPreferencesChange }: TabConfigPanelProps) {
  const { t } = useTranslation()
  const { addToast } = useToast()

  const CONFIGURABLE_TABS = [
    { key: 'board', label: t('tabs.board') },
    { key: 'stories', label: t('tabs.stories') },
    { key: 'sprints', label: t('sprints.title') },
    { key: 'timeline', label: t('timeline.title') },
    { key: 'members', label: t('tabs.members') },
  ]

  const [localOrder, setLocalOrder] = useState(tabOrder)
  const [localHidden, setLocalHidden] = useState(hiddenTabs)

  useEffect(() => { setLocalOrder(tabOrder) }, [tabOrder])
  useEffect(() => { setLocalHidden(hiddenTabs) }, [hiddenTabs])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((order: string[], hidden: string[], prevOrder: string[], prevHidden: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      preferencesApi.update(projectId, { tab_order: order, hidden_tabs: hidden })
        .then(() => onPreferencesChange(order, hidden))
        .catch(() => {
          setLocalOrder(prevOrder)
          setLocalHidden(prevHidden)
          addToast(t('errors.save_failed'), 'error')
        })
    }, 300)
  }, [projectId, onPreferencesChange, addToast, t])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localOrder.indexOf(active.id as string)
    const newIndex = localOrder.indexOf(over.id as string)
    const newOrder = arrayMove(localOrder, oldIndex, newIndex)
    setLocalOrder(newOrder)
    debouncedSave(newOrder, localHidden, localOrder, localHidden)
  }

  const handleToggle = (key: string) => {
    const newHidden = localHidden.includes(key)
      ? localHidden.filter((k) => k !== key)
      : [...localHidden, key]
    setLocalHidden(newHidden)
    debouncedSave(localOrder, newHidden, localOrder, localHidden)
  }

  // Render tabs in localOrder, then any missing ones at the end
  const orderedKeys = [
    ...localOrder.filter((k) => CONFIGURABLE_TABS.some((t) => t.key === k)),
    ...CONFIGURABLE_TABS.filter((t) => !localOrder.includes(t.key)).map((t) => t.key),
  ]

  const labelMap = Object.fromEntries(CONFIGURABLE_TABS.map((t) => [t.key, t.label]))

  return (
    <div className="max-w-md">
      <h2 className="text-[14px] font-semibold mb-1">{t('tabs.settings')}</h2>
      <p className="text-[12px] text-stone-500 mb-4">{t('tabs.reorder_hint')}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
          {orderedKeys.map((key) => (
            <SortableTabRow
              key={key}
              tabKey={key}
              label={labelMap[key] ?? key}
              isHidden={localHidden.includes(key)}
              onToggle={() => handleToggle(key)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
