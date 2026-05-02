import { useEffect, useRef, useState } from 'react'
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
import { SprintView } from './SprintView'
import { TimelineView } from './TimelineView'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectsApi, invitationsApi, storiesApi, tasksApi, preferencesApi } from '../services/api'
import { TabConfigPanel } from '../components/settings/TabConfigPanel'
import type { ProjectResponse, MemberResponse, StoryResponse, TaskResponse, Status, Priority, Role } from '../services/api'
import { CreateTaskModal } from '../components/tasks/CreateTaskModal'
import { useRole } from '../hooks/useRole'
import { useStories } from '../hooks/useStories'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'
import { taskHref } from '../utils/links'

type Tab = 'board' | 'stories' | 'members' | 'sprints' | 'timeline' | 'settings'


const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)
const IUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
)
const IBoard = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="4" width="6" height="16" rx="1"/><rect x="11" y="4" width="6" height="10" rx="1"/>
  </svg>
)
const IList = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
  </svg>
)
const IMore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
  </svg>
)
const IArchive = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>
  </svg>
)
const IChevron = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6"/>
  </svg>
)
const ISprint = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
  </svg>
)
const ITimeline = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    <circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="14" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
  </svg>
)
const ICog = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const AV_CLASSES = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']
function avatarClass(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % AV_CLASSES.length
  return AV_CLASSES[h]
}

function Avatar({ member, size = 22 }: { member: MemberResponse; size?: number }) {
  return (
    <span
      title={member.name}
      style={{ width: size, height: size, fontSize: size >= 28 ? 11 : 9.5 }}
      className={`${avatarClass(member.user_id)} inline-flex items-center justify-center rounded-full text-white font-medium ring-2 ring-white dark:ring-stone-900`}
    >
      {initials(member.name)}
    </span>
  )
}

function AvatarStack({ members, max = 4, size = 20 }: { members: MemberResponse[]; max?: number; size?: number }) {
  const visible = members.slice(0, max)
  const more = members.length - visible.length
  return (
    <div className="flex -space-x-1.5">
      {visible.map((m) => <Avatar key={m.user_id} member={m} size={size} />)}
      {more > 0 && (
        <span
          style={{ width: size, height: size, fontSize: 9.5 }}
          className="rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 inline-flex items-center justify-center font-medium ring-2 ring-white dark:ring-stone-900"
        >
          +{more}
        </span>
      )}
    </div>
  )
}

function EmptyColumnDropZone({ statusSlug }: { statusSlug: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: statusSlug })
  return (
    <div
      ref={setNodeRef}
      className={`h-16 rounded-lg border border-dashed transition-colors ${
        isOver
          ? 'border-stone-400 bg-stone-100 dark:border-stone-600 dark:bg-stone-800/50'
          : 'border-stone-200 dark:border-stone-800'
      }`}
    />
  )
}

function BoardCard({ task, storyTitle, dragOverlay }: { task: TaskResponse; storyTitle?: string; dragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
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
        className="lift block bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 p-3 hover:border-stone-300 dark:hover:border-stone-700"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <PriorityBars priority={task.priority} />
          <span className="text-[10.5px] text-stone-400">{formatRelative(task.created_at)}</span>
        </div>
        <div className="text-[13px] leading-snug">{task.title}</div>
        {storyTitle && (
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-[10.5px] text-stone-400 truncate flex-1">{storyTitle}</span>
          </div>
        )}
      </Link>
    </div>
  )
}

function SortableStoriesTaskRow({ task, storyId, href, children, dragOverlay }: {
  task: TaskResponse; storyId: string | null; href: string; children: React.ReactNode; dragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { storyId },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={dragOverlay ? undefined : style} {...attributes} {...listeners}>
      <Link to={href} className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-1.5 pl-8 bg-stone-50/60 dark:bg-stone-900/20 hover:bg-stone-100/60 dark:hover:bg-stone-900/40 border-t border-stone-100/60 dark:border-stone-800/40 first:border-t-0">
        {children}
      </Link>
    </div>
  )
}

type StorySortField = 'created_at' | 'status' | 'priority' | 'title'

const STORY_STATUS_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, in_testing: 3, done: 4 }
const STORY_PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

function applySortField(a: StoryResponse, b: StoryResponse, field: StorySortField): number {
  if (field === 'status') return STORY_STATUS_ORDER[a.status] - STORY_STATUS_ORDER[b.status]
  if (field === 'priority') return STORY_PRIORITY_ORDER[a.priority] - STORY_PRIORITY_ORDER[b.priority]
  if (field === 'title') return a.title.localeCompare(b.title)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { isManager } = useRole(id)
  const { addToast } = useToast()

  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const initialTab = (new URLSearchParams(location.search).get('tab') as Tab | null) ?? 'board'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)

  const storiesHook = useStories(id ?? '')
  const { statuses: projectStatuses } = useProjectStatuses(id)


  const [showCreateStory, setShowCreateStory] = useState(false)
  const [newStoryTitle, setNewStoryTitle] = useState('')
  const [creatingStory, setCreatingStory] = useState(false)
  const [newStoryDescription, setNewStoryDescription] = useState('')
  const [newStoryStatus, setNewStoryStatus] = useState<Status>('to_do')
  const [newStoryPriority, setNewStoryPriority] = useState<Priority>('medium')

  const [showNewDropdown, setShowNewDropdown] = useState(false)
  const newDropdownRef = useRef<HTMLDivElement>(null)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('contributor')
  const [inviting, setInviting] = useState(false)

  const [deleteStoryId, setDeleteStoryId] = useState<string | null>(null)
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false)
  const [editStory, setEditStory] = useState<{ id: string; title: string; description: string } | null>(null)
  const [savingStory, setSavingStory] = useState(false)
  const [tasksByStory, setTasksByStory] = useState<Record<string, TaskResponse[]>>({})

  const [showCreateTask, setShowCreateTask] = useState(false)

  const [storySearch, setStorySearch] = useState('')
  const [storyFilterStatus, setStoryFilterStatus] = useState<Status | 'all'>('all')
  const [storyFilterPriority, setStoryFilterPriority] = useState<Priority | 'all'>('all')
  const [storySortField, setStorySortField] = useState<StorySortField>('created_at')
  const [storySortDir, setStorySortDir] = useState<'asc' | 'desc'>('desc')

  const [boardSearch, setBoardSearch] = useState('')
  const [boardFilterPriority, setBoardFilterPriority] = useState<Priority | 'all'>('all')
  const [boardFilterAssignee, setBoardFilterAssignee] = useState('')
  const [boardFilterStory, setBoardFilterStory] = useState('')

  const [tabOrder, setTabOrder] = useState<string[]>(['board', 'stories', 'sprints', 'timeline', 'members'])
  const [hiddenTabs, setHiddenTabs] = useState<string[]>([])

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeStoriesTaskId, setActiveStoriesTaskId] = useState<string | null>(null)
  const boardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    const modal = (location.state as { modal?: string } | null)?.modal
    if (modal === 'create-story') {
      setShowCreateStory(true)
      window.history.replaceState({}, '')
    } else if (modal === 'create-task') {
      setShowCreateTask(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  useEffect(() => {
    if (!showNewDropdown) return
    function handleClick(e: MouseEvent) {
      if (newDropdownRef.current && e.target instanceof Node && !newDropdownRef.current.contains(e.target)) {
        setShowNewDropdown(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowNewDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showNewDropdown])

  useEffect(() => {
    if (!showCreateStory) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowCreateStory(false)
        setNewStoryTitle('')
        setNewStoryDescription('')
        setNewStoryStatus('to_do')
        setNewStoryPriority('medium')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showCreateStory])

  useEffect(() => {
    if (!id) return
    Promise.all([
      projectsApi.get(id),
      projectsApi.listMembers(id),
    ]).then(([pRes, mRes]) => {
      setProject(pRes.data)
      setMembers(mRes.data)
    }).finally(() => setLoading(false))
  }, [id])

  const fetchingStoriesRef = useRef(new Set<string>())
  useEffect(() => {
    if (!id) return
    preferencesApi.get(id).then((res) => {
      setTabOrder(res.data.tab_order)
      setHiddenTabs(res.data.hidden_tabs)
    }).catch(() => {}) // fall back to default order on error
  }, [id])

  useEffect(() => {
    const stories = storiesHook.items
    if (!stories.length) return
    stories.forEach((story) => {
      if (tasksByStory[story.id] !== undefined) return
      if (fetchingStoriesRef.current.has(story.id)) return
      fetchingStoriesRef.current.add(story.id)
      tasksApi.list(story.id, { limit: 25 }).then((res) => {
        setTasksByStory((prev) => ({ ...prev, [story.id]: res.data.items }))
      }).catch(() => {
        setTasksByStory((prev) => ({ ...prev, [story.id]: [] }))
      }).finally(() => {
        fetchingStoriesRef.current.delete(story.id)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storiesHook.items])


  const handleStatusChange = async (status: Status) => {
    if (!id) return
    const res = await projectsApi.update(id, { status })
    setProject(res.data)
    setEditingStatus(false)
    addToast('Status updated')
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!id) return
    const res = await projectsApi.update(id, { priority })
    setProject(res.data)
    setEditingPriority(false)
    addToast('Priority updated')
  }

  const handleArchive = async () => {
    if (!id) return
    if (project?.archived_at) {
      await projectsApi.restore(id)
      addToast('Project restored')
    } else {
      await projectsApi.archive(id)
      addToast('Project archived')
    }
    const res = await projectsApi.get(id)
    setProject(res.data)
  }

  const handleDeleteProject = async () => {
    if (!id) return
    await projectsApi.delete(id)
    addToast('Project deleted')
    navigate('/projects')
  }

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setCreatingStory(true)
    try {
      await storiesApi.create(id, {
        title: newStoryTitle,
        description: newStoryDescription || undefined,
        status: newStoryStatus,
        priority: newStoryPriority,
      })
      setShowCreateStory(false)
      setNewStoryTitle('')
      setNewStoryDescription('')
      setNewStoryStatus('to_do')
      setNewStoryPriority('medium')
      storiesHook.refresh()
      addToast('Story created')
    } finally {
      setCreatingStory(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    setInviting(true)
    try {
      await invitationsApi.create(id, { invitee_email: inviteEmail, role: inviteRole })
      setShowInvite(false)
      setInviteEmail('')
      addToast('Invitation sent')
    } finally {
      setInviting(false)
    }
  }

  const handleSaveStory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editStory) return
    setSavingStory(true)
    try {
      await storiesApi.update(editStory.id, { title: editStory.title, description: editStory.description || undefined })
      setEditStory(null)
      storiesHook.refresh()
      addToast('Story updated')
    } finally {
      setSavingStory(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!id) return
    await projectsApi.removeMember(id, userId)
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    addToast('Member removed')
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  // Build flat task list for board
  const allTasks: Array<{ task: TaskResponse; story: StoryResponse | null }> = [
    ...storiesHook.items.flatMap((story) =>
      (tasksByStory[story.id] ?? []).map((task) => ({ task, story }))
    ),
  ]

  // Stories tab derived values
  const totalTaskCount = allTasks.length

  const filteredStories = storiesHook.items
    .filter(s => !storySearch || s.title.toLowerCase().includes(storySearch.toLowerCase()))
    .filter(s => storyFilterStatus === 'all' || s.status === storyFilterStatus)
    .filter(s => storyFilterPriority === 'all' || s.priority === storyFilterPriority)
    .sort((a, b) => {
      if (a.is_default) return 1
      if (b.is_default) return -1
      const c = applySortField(a, b, storySortField)
      return storySortDir === 'asc' ? c : -c
    })

  // Board tab derived values
  const totalDoneCount = allTasks.filter(({ task }) => task.status === 'done').length

  const filteredBoardTasks = allTasks
    .filter(({ story }) => story === null || story.status !== 'done')
    .filter(({ task }) => !boardSearch || task.title.toLowerCase().includes(boardSearch.toLowerCase()))
    .filter(({ task }) => boardFilterPriority === 'all' || task.priority === boardFilterPriority)
    .filter(({ task }) => !boardFilterAssignee || task.assignee_id === boardFilterAssignee)
    .filter(({ story }) => {
      if (!boardFilterStory) return true
      return story?.id === boardFilterStory
    })
    .sort((a, b) => a.task.position - b.task.position)

  const findTaskById = (taskId: string): TaskResponse | undefined => {
    for (const tasks of Object.values(tasksByStory)) {
      const t = tasks.find((t) => t.id === taskId)
      if (t) return t
    }
    return undefined
  }

  const updateTaskInState = (taskId: string, updates: Partial<TaskResponse>) => {
    setTasksByStory((prev) => {
      const next = { ...prev }
      for (const [storyId, tasks] of Object.entries(next)) {
        const idx = tasks.findIndex((t) => t.id === taskId)
        if (idx !== -1) {
          next[storyId] = tasks.map((t, i) => i === idx ? { ...t, ...updates } : t)
          return next
        }
      }
      return next
    })
  }

  const handleBoardDragStart = (event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string)
  }

  const handleBoardDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTaskId(null)
    if (!over || active.id === over.id) return

    const activeTask = findTaskById(active.id as string)
    const overTask = findTaskById(over.id as string)
    if (!activeTask) return

    const sourceStatus = activeTask.status
    const destStatus = overTask?.status ?? (over.id as string)

    if (sourceStatus !== destStatus) {
      // Cross-column: update status
      updateTaskInState(active.id as string, { status: destStatus as Status })
      tasksApi.update(active.id as string, { status: destStatus as Status }).catch(() => {
        // rollback on error
        updateTaskInState(active.id as string, { status: sourceStatus })
      })
    } else {
      // Same column: reorder
      const columnTasks = allTasks
        .filter(({ task }) => task.status === sourceStatus)
        .sort((a, b) => a.task.position - b.task.position)
        .map(({ task }) => task)

      const oldIndex = columnTasks.findIndex((t) => t.id === active.id)
      const newIndex = columnTasks.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(columnTasks, oldIndex, newIndex)
      const updates = reordered.map((t, i) => ({ ...t, position: i }))

      updates.forEach((t) => updateTaskInState(t.id, { position: t.position }))

      if (id) {
        tasksApi.reorder(id, updates.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
      }
    }
  }

  const handleStoriesDragStart = (event: DragStartEvent) => {
    setActiveStoriesTaskId(event.active.id as string)
  }

  const handleStoriesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveStoriesTaskId(null)
    if (!over || active.id === over.id) return

    const activeData = active.data.current as { storyId: string | null } | undefined
    const overData = over.data.current as { storyId: string | null } | undefined

    const sourceStoryId = activeData?.storyId ?? null
    const destStoryId = overData?.storyId ?? null

    const sourceList = [...(tasksByStory[sourceStoryId ?? ''] ?? [])].sort((a, b) => a.position - b.position)

    if (sourceStoryId === destStoryId) {
      // Same story/backlog: reorder within group
      const oldIndex = sourceList.findIndex((t) => t.id === active.id)
      const newIndex = sourceList.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(sourceList, oldIndex, newIndex).map((t, i) => ({ ...t, position: i }))

      if (sourceStoryId) {
        setTasksByStory((prev) => ({ ...prev, [sourceStoryId]: reordered }))
      }
      if (id) {
        tasksApi.reorder(id, reordered.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
      }
    } else {
      // Cross-story: move task to different story (or backlog)
      const taskToMove = sourceList.find((t) => t.id === active.id)
      if (!taskToMove) return

      const newSourceList = sourceList.filter((t) => t.id !== active.id).map((t, i) => ({ ...t, position: i }))

      const destList = [...(tasksByStory[destStoryId ?? ''] ?? [])].sort((a, b) => a.position - b.position)
      const overIndex = destList.findIndex((t) => t.id === over.id)
      const insertAt = overIndex === -1 ? destList.length : overIndex
      const movedTask = { ...taskToMove, story_id: destStoryId }
      const newDestList = [
        ...destList.slice(0, insertAt),
        movedTask,
        ...destList.slice(insertAt),
      ].map((t, i) => ({ ...t, position: i }))

      // Optimistic update
      if (sourceStoryId) {
        setTasksByStory((prev) => ({ ...prev, [sourceStoryId]: newSourceList }))
      }
      if (destStoryId) {
        setTasksByStory((prev) => ({ ...prev, [destStoryId]: newDestList }))
      }

      // Persist
      if (id) {
        tasksApi.update(active.id as string, { story_id: destStoryId })
          .then(() => {
            tasksApi.reorder(id, newDestList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
            if (newSourceList.length > 0) {
              tasksApi.reorder(id, newSourceList.map((t) => ({ task_id: t.id, position: t.position }))).catch(() => {})
            }
          })
          .catch(() => {
            if (sourceStoryId) {
              setTasksByStory((prev) => ({ ...prev, [sourceStoryId]: sourceList }))
            }
            if (destStoryId) {
              setTasksByStory((prev) => ({ ...prev, [destStoryId]: destList }))
            }
          })
      }
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="px-7 pt-6 pb-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }
  if (!project) return null

  return (
    <div className="flex-1 flex flex-col">
      {/* Project header */}
      <div className="px-7 pt-5 pb-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="flex items-center gap-2 text-[11.5px] text-stone-500 mb-2">
          <Link to="/projects" className="hover:text-stone-800 dark:hover:text-stone-200">{t('projects.title')}</Link>
          <span>/</span>
          <span>{project.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight">{project.name}</h1>
              {editingStatus ? (
                <select
                  autoFocus
                  defaultValue={project.status}
                  onChange={(e) => handleStatusChange(e.target.value as Status)}
                  onBlur={() => setEditingStatus(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
              ) : (
                <button onClick={() => setEditingStatus(true)}>
                  <StatusPill status={project.status} statuses={projectStatuses} />
                </button>
              )}
              {editingPriority ? (
                <select
                  autoFocus
                  defaultValue={project.priority}
                  onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                  onBlur={() => setEditingPriority(false)}
                  className="text-[12px] px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                >
                  {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
              ) : (
                <button onClick={() => setEditingPriority(true)}>
                  <PriorityBars priority={project.priority} withLabel />
                </button>
              )}
              {project.archived_at && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-500">{t('board.archived')}</span>
              )}
            </div>
            {project.description && (
              <p className="text-[13px] text-stone-500 mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AvatarStack members={members} max={5} size={24} />
            {isManager && (
              <>
                <button
                  onClick={() => setShowInvite(true)}
                  className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900 inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300"
                >
                  <IUser /> {t('board.invite')}
                </button>
                <div className="relative" ref={newDropdownRef}>
                  <button
                    onClick={() => setShowNewDropdown(v => !v)}
                    aria-haspopup="true"
                    aria-expanded={showNewDropdown}
                    className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
                  >
                    <IPlus /> New <IChevron />
                  </button>
                  {showNewDropdown && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-lg z-20 min-w-[120px]">
                      <button
                        onClick={() => { setShowNewDropdown(false); setShowCreateStory(true) }}
                        className="w-full flex items-center px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-t-md"
                      >
                        Story
                      </button>
                      <button
                        onClick={() => { setShowNewDropdown(false); setShowCreateTask(true) }}
                        className="w-full flex items-center px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-b-md"
                      >
                        Task
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative group">
                  <button className="px-1.5 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900 text-stone-500"><IMore /></button>
                  <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-lg z-20 min-w-[140px]">
                    <button
                      onClick={handleArchive}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      <IArchive /> {project.archived_at ? t('actions.restore') : t('actions.archive')}
                    </button>
                    <button
                      onClick={() => setDeleteProjectConfirm(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-rose-600 hover:bg-stone-50 dark:hover:bg-stone-800"
                    >
                      {t('actions.delete')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-4 flex items-center gap-5 text-[13px]">
          {(() => {
            const ALL_TABS: Record<string, { label: string; icon: React.ReactNode }> = {
              board: { label: t('tabs.board'), icon: <IBoard /> },
              stories: { label: t('tabs.stories'), icon: <IList /> },
              sprints: { label: t('sprints.title'), icon: <ISprint /> },
              timeline: { label: t('timeline.title'), icon: <ITimeline /> },
              members: { label: t('tabs.members'), icon: <IUser /> },
            }
            const visibleTabs = tabOrder
              .filter((k) => !hiddenTabs.includes(k) && ALL_TABS[k])
              .map((k) => [k, ALL_TABS[k].label, ALL_TABS[k].icon] as [Tab, string, React.ReactNode])
            const settingsTab: [Tab, string, React.ReactNode] = ['settings', t('tabs.settings'), <ICog />]
            return [...visibleTabs, settingsTab].map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`pb-2 -mb-px flex items-center gap-1.5 border-b-2 ${tab === key ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
              >
                <span className="text-stone-400">{icon}</span>{label}
              </button>
            ))
          })()}
        </div>
      </div>

      {/* Board tab */}
      {tab === 'board' && (
        <>
          {/* Board toolbar */}
          <div className="flex items-center gap-2 px-7 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
            <input
              type="text"
              aria-label={t('filter.search')}
              placeholder={t('filter.search')}
              value={boardSearch}
              onChange={e => setBoardSearch(e.target.value)}
              className="w-40 px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            />
            <select
              aria-label={t('filter.priority')}
              value={boardFilterPriority}
              onChange={e => setBoardFilterPriority(e.target.value as Priority | 'all')}
              className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="all">{t('filter.all')} {t('filter.priority')}</option>
              {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
            <select
              aria-label={t('filter.assignee')}
              value={boardFilterAssignee}
              onChange={e => setBoardFilterAssignee(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="">{t('filter.all')} {t('filter.assignee')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
            <select
              aria-label={t('filter.story')}
              value={boardFilterStory}
              onChange={e => setBoardFilterStory(e.target.value)}
              className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="">{t('filter.all')} {t('filter.story')}</option>
              {storiesHook.items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <span className="flex-1" />
            <span className="text-[11.5px] text-stone-400 tabular-nums">
              {t('toolbar.tasks_count', { count: allTasks.length })} · {t('toolbar.done_count', { count: totalDoneCount })}
            </span>
          </div>
          <div className="flex-1 overflow-x-auto scroll-hidden bg-stone-50 dark:bg-stone-950/50 fine-grid">
            <DndContext
              sensors={boardSensors}
              collisionDetection={closestCenter}
              onDragStart={handleBoardDragStart}
              onDragEnd={handleBoardDragEnd}
            >
            <div className="flex gap-3 px-7 py-5 min-w-min min-h-full">
              {projectStatuses.map((ps) => {
                const columnTasks = filteredBoardTasks.filter(({ task }) => task.status === ps.slug)
                return (
                  <div key={ps.slug} className="w-[272px] shrink-0">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: ps.colour }} />
                      <span className="text-[12px] font-medium">{ps.name}</span>
                      <span className="text-[11px] text-stone-400 tabular-nums">{columnTasks.length}</span>
                    </div>
                    <SortableContext items={columnTasks.map(({ task }) => task.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {columnTasks.map(({ task, story }) => (
                          <BoardCard key={task.id} task={task} storyTitle={story?.title} />
                        ))}
                        {columnTasks.length === 0 && <EmptyColumnDropZone statusSlug={ps.slug} />}
                      </div>
                    </SortableContext>
                  </div>
                )
              })}

              {/* Unlisted statuses section */}
              {(() => {
                const knownSlugs = new Set(projectStatuses.map((s) => s.slug))
                const unlistedSlugs = [
                  ...new Set(
                    filteredBoardTasks
                      .filter(({ task }) => !knownSlugs.has(task.status))
                      .map(({ task }) => task.status)
                  ),
                ]
                if (unlistedSlugs.length === 0) return null
                return (
                  <>
                    <div className="shrink-0 flex items-center gap-3 self-stretch">
                      <div className="w-px bg-stone-200 dark:bg-stone-700 self-stretch" />
                      <span className="text-[11px] text-stone-400 whitespace-nowrap">
                        {t('project_statuses.unlisted')}
                      </span>
                      <div className="w-px bg-stone-200 dark:bg-stone-700 self-stretch" />
                    </div>
                    {unlistedSlugs.map((slug) => {
                      const columnTasks = filteredBoardTasks.filter(({ task }) => task.status === slug)
                      return (
                        <div key={slug} className="w-[272px] shrink-0">
                          <div className="flex items-center gap-2 px-1 mb-2">
                            <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600" />
                            <span className="text-[12px] font-medium text-stone-400 font-mono">{slug}</span>
                            <span className="text-[11px] text-stone-400 tabular-nums">{columnTasks.length}</span>
                          </div>
                          <div className="space-y-1.5">
                            {columnTasks.map(({ task, story }) => (
                              <BoardCard key={task.id} task={task} storyTitle={story?.title} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>
              <DragOverlay>
                {activeTaskId ? (() => {
                  const found = allTasks.find(({ task }) => task.id === activeTaskId)
                  return found ? <BoardCard task={found.task} storyTitle={found.story?.title} dragOverlay /> : null
                })() : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}

      {/* Stories tab */}
      {tab === 'stories' && (
        <div className="flex-1 px-7 py-5">
          {storiesHook.items.length === 0 ? (
            <EmptyState
              message={t('stories.empty')}
              action={isManager ? { label: t('stories.create'), onClick: () => setShowCreateStory(true) } : undefined}
            />
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  aria-label={t('filter.search')}
                  placeholder={t('filter.search')}
                  value={storySearch}
                  onChange={e => setStorySearch(e.target.value)}
                  className="w-40 px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                />
                <select
                  aria-label={t('filter.status')}
                  value={storyFilterStatus}
                  onChange={e => setStoryFilterStatus(e.target.value as Status | 'all')}
                  className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="all">{t('filter.all')} {t('filter.status')}</option>
                  {statuses.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
                <select
                  aria-label={t('filter.priority')}
                  value={storyFilterPriority}
                  onChange={e => setStoryFilterPriority(e.target.value as Priority | 'all')}
                  className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="all">{t('filter.all')} {t('filter.priority')}</option>
                  {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
                <select
                  aria-label="Sort by"
                  value={storySortField}
                  onChange={e => setStorySortField(e.target.value as StorySortField)}
                  className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="created_at">{t('sort.created')}</option>
                  <option value="status">{t('sort.status')}</option>
                  <option value="priority">{t('sort.priority')}</option>
                  <option value="title">{t('sort.title')}</option>
                </select>
                <button
                  onClick={() => setStorySortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  aria-label={storySortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  className="px-2.5 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  {storySortDir === 'asc' ? '↑' : '↓'}
                </button>
                <span className="flex-1" />
                <span className="text-[11.5px] text-stone-400 tabular-nums">
                  {t('toolbar.tasks_count', { count: totalTaskCount })} · {t('toolbar.stories_count', { count: storiesHook.items.length })}
                </span>
              </div>

              {/* Stories table */}
              {filteredStories.length === 0 ? (
                <p className="text-[13px] text-stone-400 py-8 text-center">{t('filter.no_results')}</p>
              ) : (
                <DndContext
                  sensors={boardSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleStoriesDragStart}
                  onDragEnd={handleStoriesDragEnd}
                >
                  <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
                    <div className="grid grid-cols-[1fr_120px_100px_100px_80px] px-4 py-2 text-[10.5px] uppercase tracking-wider text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30">
                      <span>{t('board.col_title')}</span>
                      <span>{t('board.col_status')}</span>
                      <span>{t('board.col_priority')}</span>
                      <span>{t('board.col_tasks')}</span>
                      <span className="text-right">{t('board.col_updated')}</span>
                    </div>
                    {filteredStories.map((story) => {
                      const storyTasks = [...(tasksByStory[story.id] ?? [])].sort((a, b) => a.position - b.position)
                      return (
                        <div key={story.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                          <div className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <Link
                                  to={`/projects/${id}/stories/${story.id}`}
                                  className="text-[13px] font-medium hover:accent-text"
                                >
                                  {story.title}
                                </Link>
                                {story.is_default && (
                                  <span className="shrink-0 text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500">
                                    {t('stories.backlog')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {story.is_default
                              ? <span className="text-[11px] text-stone-300 dark:text-stone-700">—</span>
                              : <StatusPill status={story.status} statuses={projectStatuses} />}
                            {story.is_default
                              ? <span className="text-[11px] text-stone-300 dark:text-stone-700">—</span>
                              : <PriorityBars priority={story.priority} withLabel />}
                            <span className="text-[12px] text-stone-500">{tasksByStory[story.id]?.length ?? '…'}</span>
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-[11px] text-stone-400">{formatRelative(story.created_at)}</span>
                              {isManager && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setEditStory({ id: story.id, title: story.title, description: story.description ?? '' })}
                                    className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                                  >
                                    {t('actions.edit')}
                                  </button>
                                  {!story.is_default && (
                                    <button
                                      onClick={() => setDeleteStoryId(story.id)}
                                      className="text-[11px] text-rose-400 hover:text-rose-600"
                                    >
                                      {t('actions.delete')}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Tasks inline */}
                          {storyTasks.length > 0 && (
                            <div className="border-t border-stone-50 dark:border-stone-800/60">
                              <SortableContext items={storyTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                                {storyTasks.map((task) => (
                                  <SortableStoriesTaskRow
                                    key={task.id}
                                    task={task}
                                    storyId={story.id}
                                    href={`/stories/${story.id}/tasks/${task.id}`}
                                  >
                                    <span className="text-[12px] text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                                    <StatusPill status={task.status} statuses={projectStatuses} />
                                    <PriorityBars priority={task.priority} withLabel />
                                    <span />
                                    <span className="text-[11px] text-stone-400 text-right">{formatRelative(task.created_at)}</span>
                                  </SortableStoriesTaskRow>
                                ))}
                              </SortableContext>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <DragOverlay>
                    {activeStoriesTaskId ? (() => {
                      const task = findTaskById(activeStoriesTaskId)
                      if (!task) return null
                      const storyId = task.story_id ?? null
                      const href = storyId ? `/stories/${storyId}/tasks/${task.id}` : `/projects/${id}/tasks/${task.id}`
                      return (
                        <SortableStoriesTaskRow task={task} storyId={storyId} href={href} dragOverlay>
                          <span className="text-[12px] text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                          <StatusPill status={task.status} statuses={projectStatuses} />
                          <PriorityBars priority={task.priority} withLabel />
                          <span />
                          <span className="text-[11px] text-stone-400 text-right">{formatRelative(task.created_at)}</span>
                        </SortableStoriesTaskRow>
                      )
                    })() : null}
                  </DragOverlay>
                </DndContext>
              )}
              {storiesHook.nextCursor && (
                <LoadMoreButton onLoadMore={storiesHook.loadMore} isLoading={storiesHook.isLoading} />
              )}
            </>
          )}
        </div>
      )}

      {/* Sprints tab */}
      {tab === 'sprints' && id && <SprintView projectId={id} />}

      {/* Timeline tab */}
      {tab === 'timeline' && id && <TimelineView projectId={id} />}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="flex-1 px-7 py-5">
          {isManager && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowInvite(true)}
                className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
              >
                <IPlus /> {t('members.invite')}
              </button>
            </div>
          )}
          {members.length === 0 ? (
            <EmptyState message={t('members.empty')} />
          ) : (
            <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0"
                >
                  <Avatar member={m} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium">{m.name}</div>
                    <div className="text-[11.5px] text-stone-500">{m.email}</div>
                  </div>
                  <span className="text-[11.5px] text-stone-500">{t(`role.${m.role}`)}</span>
                  {isManager && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-[12px] text-rose-500 hover:text-rose-700"
                    >
                      {t('actions.delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && id && (
        <div className="flex-1 px-7 py-5">
          <TabConfigPanel
            projectId={id}
            tabOrder={tabOrder}
            hiddenTabs={hiddenTabs}
            onPreferencesChange={(newOrder, newHidden) => {
              setTabOrder(newOrder)
              setHiddenTabs(newHidden)
            }}
          />
        </div>
      )}

      {/* Modals */}
      {showCreateTask && (
        <CreateTaskModal
          projectId={id!}
          onCreated={(task) => {
            if (task.story_id) {
              setTasksByStory((prev) => ({
                ...prev,
                [task.story_id!]: [task, ...(prev[task.story_id!] ?? [])],
              }))
            }
            setShowCreateTask(false)
          }}
          onClose={() => setShowCreateTask(false)}
        />
      )}

      {showCreateStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 w-[min(90vw,_900px)] min-w-[67vw] mx-4">
            <h3 className="text-[15px] font-semibold mb-5">{t('stories.create')}</h3>
            <form onSubmit={handleCreateStory} className="space-y-4">
              <input
                type="text"
                placeholder={t('board.col_title')}
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
              <MarkdownEditor
                value={newStoryDescription}
                onChange={setNewStoryDescription}
                rows={4}
                placeholder={t('tasks.description')}
                autoExpand
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="pdp-create-story-status" className="text-[11.5px] font-medium text-stone-500">{t('filter.status')}</label>
                  <select
                    id="pdp-create-story-status"
                    value={newStoryStatus}
                    onChange={(e) => setNewStoryStatus(e.target.value as Status)}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                  >
                    {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="pdp-create-story-priority" className="text-[11.5px] font-medium text-stone-500">{t('filter.priority')}</label>
                  <select
                    id="pdp-create-story-priority"
                    value={newStoryPriority}
                    onChange={(e) => setNewStoryPriority(e.target.value as Priority)}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
                  >
                    {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowCreateStory(false); setNewStoryTitle(''); setNewStoryDescription(''); setNewStoryStatus('to_do'); setNewStoryPriority('medium') }} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={creatingStory} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md disabled:opacity-50">
                  {t('actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-md w-full mx-4">
            <h3 className="text-[15px] font-semibold mb-4">{t('members.invite')}</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <input
                type="email"
                placeholder={t('members.email')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px]"
              >
                <option value="contributor">{t('role.contributor')}</option>
                <option value="manager">{t('role.manager')}</option>
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowInvite(false)} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={inviting} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md disabled:opacity-50">
                  {t('members.invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-md w-full mx-4">
            <h3 className="text-[15px] font-semibold mb-4">{t('actions.edit')}</h3>
            <form onSubmit={handleSaveStory} className="space-y-4">
              <input
                type="text"
                value={editStory.title}
                onChange={(e) => setEditStory({ ...editStory, title: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
              <MarkdownEditor value={editStory.description} onChange={(v) => setEditStory({ ...editStory, description: v })} rows={3} autoExpand />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditStory(null)} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={savingStory} className="px-3 py-1.5 text-[12.5px] accent-bg rounded-md disabled:opacity-50">
                  {t('actions.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteStoryId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={`Delete story "${storiesHook.items.find(s => s.id === deleteStoryId)?.title ?? ''}"?`}
          onConfirm={async () => {
            await storiesApi.delete(deleteStoryId)
            setDeleteStoryId(null)
            storiesHook.refresh()
            addToast('Story deleted')
          }}
          onCancel={() => setDeleteStoryId(null)}
          confirmLabel={t('actions.delete')}
        />
      )}

      {deleteProjectConfirm && (
        <ConfirmDialog
          title={t('actions.confirm')}
          onConfirm={handleDeleteProject}
          onCancel={() => setDeleteProjectConfirm(false)}
          confirmLabel={t('actions.delete')}
        />
      )}
    </div>
  )
}
