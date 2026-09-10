import { Children, useEffect, useMemo, useRef, useState } from 'react'
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
import { SprintView } from './SprintView'
import { TimelineView } from './TimelineView'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectsApi, invitationsApi, storiesApi, tasksApi, preferencesApi } from '../services/api'
import { TabConfigPanel } from '../components/settings/TabConfigPanel'
import type { ProjectResponse, MemberResponse, StoryResponse, TaskResponse, Status, Priority, Role, ProjectStatusResponse } from '../services/api'
import { CreateTaskModal } from '../components/tasks/CreateTaskModal'
import { useRole } from '../hooks/useRole'
import { useDragSensors } from '../hooks/useDragSensors'
import { useStories } from '../hooks/useStories'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { Menu, MenuItem } from '../components/common/Menu'
import { Breadcrumbs } from '../components/common/Breadcrumbs'
import { Tabs } from '../components/common/Tabs'
import { PageHeader } from '../components/layout/PageHeader'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { Modal } from '../components/common/Modal'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'
import { taskHref } from '../utils/links'
import { applySortField } from '../utils/sort'
import { initials } from '../utils/initials'

type Tab = 'board' | 'stories' | 'members' | 'sprints' | 'timeline' | 'settings'

// Namespace for the tab rail's generated ids. Deliberately not derived from a
// panel id, which two tablists may share (T10).
const PROJECT_TABS_ID = 'project-tabs'

// Sentinel for the "haven't handled this location.state yet" marker below
// (mirrors ProjectsPage.tsx). location.state can legitimately be null, so a
// plain null/undefined default would not distinguish "never checked" from
// "checked and it was empty".
const UNHANDLED_LOCATION_STATE = {}


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

function BoardCard({ task, storyTitle, statuses, onStatusChange, dragOverlay }: {
  task: TaskResponse
  storyTitle?: string
  statuses: ProjectStatusResponse[]
  onStatusChange: (taskId: string, newStatus: Status) => void
  dragOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  const href = taskHref(task)
  const otherStatuses = statuses.filter((s) => s.slug !== task.status)
  return (
    <div
      ref={setNodeRef}
      className="drag-row lift bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 p-3 hover:border-stone-300 dark:hover:border-stone-700"
      style={dragOverlay ? undefined : style}
      {...attributes}
      {...listeners}
    >
      <Link to={href} className="block">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <PriorityBars priority={task.priority} />
          <span className="text-ui-xs text-stone-400">{formatRelative(task.created_at)}</span>
        </div>
        <div className="text-ui-md leading-snug">{task.title}</div>
      </Link>
      {/* Tap-pill-to-edit idiom (T07): the same tap-to-open pattern used on
          TaskDetailPage/StoryDetailPage, so touch users can change status
          without a drag. This sits as a *sibling* of the <Link> above rather
          than nested inside it — a <button> descendant of an <a> is invalid
          content per the HTML spec and real browsers get confused about
          which element owns Enter/Space activation, so keyboard users could
          never open the menu even though a jsdom test (which activates the
          button directly via .focus(), bypassing real tab order and native
          nested-control quirks) didn't catch it. The wrapping div only needs
          to stop Enter/Space from bubbling to the card's drag-listener
          wrapper, whose sortable keyboard handling would otherwise treat
          them as a drag-activation key; every other key (notably Escape,
          which the open Menu listens for on `document`) must keep bubbling. */}
      <div
        className="flex items-center gap-2 mt-2"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
        }}
      >
        <Menu
          trigger={
            <button>
              <StatusPill status={task.status} statuses={statuses} />
            </button>
          }
        >
          {otherStatuses.map((s) => (
            <MenuItem key={s.slug} onSelect={() => onStatusChange(task.id, s.slug as Status)}>
              {s.name}
            </MenuItem>
          ))}
        </Menu>
      </div>
      {storyTitle && (
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-ui-xs text-stone-400 truncate flex-1">{storyTitle}</span>
        </div>
      )}
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
  const [title, status, priority, count, updated] = Children.toArray(children)
  return (
    <div ref={setNodeRef} className="drag-row" style={dragOverlay ? undefined : style} {...attributes} {...listeners}>
      <Link to={href} draggable={false} className="grid stories-grid md:grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-1.5 pl-8 bg-stone-50/60 dark:bg-stone-900/20 hover:bg-stone-100/60 dark:hover:bg-stone-900/40 border-t border-stone-100/60 dark:border-stone-800/40 first:border-t-0">
        {title}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
          {status}
          {priority}
          {count}
          {updated}
        </div>
      </Link>
    </div>
  )
}

type StorySortField = 'created_at' | 'status' | 'priority' | 'title'

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
  const boardSensors = useDragSensors()

  const locationModal = (location.state as { modal?: string } | null)?.modal

  // The modal request arrives as router state. Adjust state during render
  // rather than from an effect: set-state-in-effect rejects the write, and
  // this runs before children render, so there is no cascading second pass.
  // The marker starts at a sentinel, not at location.state, so that the
  // first render after navigation counts as a change and opens the modal.
  const [handledLocationState, setHandledLocationState] =
    useState<unknown>(UNHANDLED_LOCATION_STATE)
  if (handledLocationState !== location.state) {
    setHandledLocationState(location.state)
    if (locationModal === 'create-story') setShowCreateStory(true)
    else if (locationModal === 'create-task') setShowCreateTask(true)
  }

  useEffect(() => {
    if (locationModal === 'create-story' || locationModal === 'create-task') {
      window.history.replaceState({}, '')
    }
  }, [locationModal])

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
    addToast(t('projects.status_updated'))
  }

  const handlePriorityChange = async (priority: Priority) => {
    if (!id) return
    const res = await projectsApi.update(id, { priority })
    setProject(res.data)
    setEditingPriority(false)
    addToast(t('projects.priority_updated'))
  }

  const handleArchive = async () => {
    if (!id) return
    if (project?.archived_at) {
      await projectsApi.restore(id)
      addToast(t('projects.restored'))
    } else {
      await projectsApi.archive(id)
      addToast(t('projects.archived_toast'))
    }
    const res = await projectsApi.get(id)
    setProject(res.data)
  }

  const handleDeleteProject = async () => {
    if (!id) return
    await projectsApi.delete(id)
    addToast(t('projects.deleted'))
    navigate('/projects')
  }

  // The only way out of the create-story overlay: Escape, the backdrop, Cancel
  // and a successful submit all land here, so the form never reopens holding
  // the values of an abandoned draft.
  const closeCreateStory = () => {
    setShowCreateStory(false)
    setNewStoryTitle('')
    setNewStoryDescription('')
    setNewStoryStatus('to_do')
    setNewStoryPriority('medium')
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
      closeCreateStory()
      storiesHook.refresh()
      addToast(t('stories.created'))
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
      addToast(t('invitations.sent'))
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
      addToast(t('stories.updated'))
    } finally {
      setSavingStory(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!id) return
    await projectsApi.removeMember(id, userId)
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    addToast(t('members.removed'))
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']
  const priorities: Priority[] = ['low', 'medium', 'high']

  // Memoised because Tabs re-scrolls its active tab into view whenever `items`
  // changes, and a fresh array on every render would yank the strip back under
  // the user's finger each time anything else in the header moves. Settings is
  // always last and can never be hidden — it is where a hidden tab is brought
  // back.
  const tabItems = useMemo(() => {
    const allTabs: Record<string, { label: string; icon: React.ReactNode }> = {
      board: { label: t('tabs.board'), icon: <IBoard /> },
      stories: { label: t('tabs.stories'), icon: <IList /> },
      sprints: { label: t('sprints.title'), icon: <ISprint /> },
      timeline: { label: t('timeline.title'), icon: <ITimeline /> },
      members: { label: t('tabs.members'), icon: <IUser /> },
    }
    return [
      ...tabOrder
        .filter((key) => !hiddenTabs.includes(key) && allTabs[key])
        .map((key) => ({ key, ...allTabs[key] })),
      { key: 'settings', label: t('tabs.settings'), icon: <ICog /> },
    ]
  }, [t, tabOrder, hiddenTabs])

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

  // Shared by both the board drag-and-drop cross-column move and the tap
  // status menu on BoardCard (T07) — one code path updates the task status,
  // optimistically and with rollback on failure.
  const updateTaskStatus = (taskId: string, newStatus: Status) => {
    const task = findTaskById(taskId)
    if (!task) return
    const previousStatus = task.status
    updateTaskInState(taskId, { status: newStatus })
    tasksApi.update(taskId, { status: newStatus }).catch(() => {
      updateTaskInState(taskId, { status: previousStatus })
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
      updateTaskStatus(active.id as string, destStatus as Status)
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

  // Handed to both branches so the loading header reserves the same crumb line
  // the loaded one fills.
  const breadcrumbs = (
    <Breadcrumbs
      items={[
        { label: t('projects.title'), to: '/projects' },
        { label: project?.name ?? '' },
      ]}
    />
  )

  // Likewise handed to both branches. The cluster is never empty — the avatar
  // stack sits outside the manager gate — so a loading header without it would
  // be a whole line shorter on a phone and the body would jump on arrival.
  const headerActions = (
    // justify-end so the cluster stays on the right once PageHeader gives
    // it the full width of its own line on a phone.
    <div className="flex items-center justify-end gap-2">
      <AvatarStack members={members} max={5} size={24} />
      {isManager && (
        <>
          <button
            onClick={() => setShowInvite(true)}
            className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900 inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300 tap-safe"
          >
            <IUser /> {t('board.invite')}
          </button>
          <Menu
            trigger={
              <button className="px-2.5 py-1.5 text-ui-sm rounded-md accent-bg inline-flex items-center gap-1.5 tap-safe">
                <IPlus /> New <IChevron />
              </button>
            }
          >
            <MenuItem onSelect={() => setShowCreateStory(true)}>Story</MenuItem>
            <MenuItem onSelect={() => setShowCreateTask(true)}>Task</MenuItem>
          </Menu>
          <Menu
            trigger={
              <button
                aria-label={t('actions.more')}
                className="px-1.5 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900 text-stone-500 tap-safe"
              >
                <IMore />
              </button>
            }
          >
            <MenuItem onSelect={handleArchive}>
              <IArchive /> {project?.archived_at ? t('actions.restore') : t('actions.archive')}
            </MenuItem>
            <MenuItem onSelect={() => setDeleteProjectConfirm(true)} destructive>
              {t('actions.delete')}
            </MenuItem>
          </Menu>
        </>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <PageHeader
          loading
          title={project?.name ?? ''}
          breadcrumbs={breadcrumbs}
          actions={headerActions}
        />
        {/* The skeletons stand in for the body below the header. */}
        <div className="px-7 py-5">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    )
  }
  if (!project) return null

  // The header's status and priority triggers are buttons, so — unlike the
  // rail's selects, which announce their own value — naming them after the
  // field alone would drop the value they show. Each name carries both, built
  // from the label the control displays so the visible text is part of the
  // accessible name (WCAG 2.5.3).
  const statusName = `${t('detail.status')}: ${
    projectStatuses.find((s) => s.slug === project.status)?.name ?? project.status
  }`
  const priorityName = `${t('detail.priority')}: ${t(`priority.${project.priority}`)}`

  return (
    <div className="flex-1 flex flex-col">
      {/* Project header */}
      <PageHeader
        title={project.name}
        breadcrumbs={breadcrumbs}
        subtitle={project.description || undefined}
        titleAdornment={
          <>
            {/* The pill and the bars say which field they are visually; these
                labels say it for everyone else. The selects are named exactly
                as the rail's equivalents are (T11). */}
            {editingStatus ? (
              <select
                autoFocus
                aria-label={t('detail.status')}
                defaultValue={project.status}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                onBlur={() => setEditingStatus(false)}
                className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            ) : (
              <button aria-label={statusName} onClick={() => setEditingStatus(true)}>
                <StatusPill status={project.status} statuses={projectStatuses} />
              </button>
            )}
            {editingPriority ? (
              <select
                autoFocus
                aria-label={t('detail.priority')}
                defaultValue={project.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                onBlur={() => setEditingPriority(false)}
                className="text-ui-sm px-2 py-1 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
              </select>
            ) : (
              <button aria-label={priorityName} onClick={() => setEditingPriority(true)}>
                <PriorityBars priority={project.priority} withLabel />
              </button>
            )}
            {project.archived_at && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-ui-2xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-500">{t('board.archived')}</span>
            )}
          </>
        }
        actions={headerActions}
      />

      {/* Sub-tabs: a strip that scrolls sideways rather than wrapping, so the
          Settings tab stays reachable at 320px. */}
      <div className="px-4 md:px-7 py-2 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <Tabs
          items={tabItems}
          value={tab}
          onChange={(key) => setTab(key as Tab)}
          label={t('tabs.project_sections')}
          idPrefix={PROJECT_TABS_ID}
        />
      </div>

      {/* Board tab */}
      {tab === 'board' && (
        <>
          {/* Board toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-4 md:px-7 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
            <input
              type="text"
              aria-label={t('filter.search')}
              placeholder={t('filter.search')}
              value={boardSearch}
              onChange={e => setBoardSearch(e.target.value)}
              className="w-40 px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            />
            <select
              aria-label={t('filter.priority')}
              value={boardFilterPriority}
              onChange={e => setBoardFilterPriority(e.target.value as Priority | 'all')}
              className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="all">{t('filter.all')} {t('filter.priority')}</option>
              {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
            <select
              aria-label={t('filter.assignee')}
              value={boardFilterAssignee}
              onChange={e => setBoardFilterAssignee(e.target.value)}
              className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="">{t('filter.all')} {t('filter.assignee')}</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </select>
            <select
              aria-label={t('filter.story')}
              value={boardFilterStory}
              onChange={e => setBoardFilterStory(e.target.value)}
              className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
            >
              <option value="">{t('filter.all')} {t('filter.story')}</option>
              {storiesHook.items.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            {/* ml-auto rather than a flex-1 spacer: once the row wraps, a spacer
                would claim a whole line of its own. */}
            <span className="ml-auto text-ui-sm text-stone-400 tabular-nums">
              {t('toolbar.tasks_count', { count: allTasks.length })} · {t('toolbar.done_count', { count: totalDoneCount })}
            </span>
          </div>
          {/* T17 lesson: a CSS mask on an ancestor clips fixed-position
              descendants, and dnd-kit's DragOverlay renders with
              position: fixed. scroll-fade-x below is a mask-image gradient,
              so DndContext (and its DragOverlay) must wrap the masked div
              rather than sit inside it — otherwise the drag preview vanishes
              near the scroller's edges. */}
          <DndContext
            sensors={boardSensors}
            collisionDetection={closestCenter}
            onDragStart={handleBoardDragStart}
            onDragEnd={handleBoardDragEnd}
          >
          {/* One column per swipe, with the T02 edge fade hinting that the
              board continues past the right edge. */}
          <div className="flex-1 overflow-x-auto snap-x snap-mandatory scroll-fade-x bg-stone-50 dark:bg-stone-950/50 fine-grid">
            <div className="flex gap-3 px-7 py-5 min-w-min min-h-full">
              {projectStatuses.map((ps) => {
                const columnTasks = filteredBoardTasks.filter(({ task }) => task.status === ps.slug)
                return (
                  <div key={ps.slug} className="w-[272px] shrink-0 snap-start">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: ps.colour }} />
                      <span className="text-ui-sm font-medium">{ps.name}</span>
                      <span className="text-ui-xs text-stone-400 tabular-nums">{columnTasks.length}</span>
                    </div>
                    <SortableContext items={columnTasks.map(({ task }) => task.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {columnTasks.map(({ task, story }) => (
                          <BoardCard key={task.id} task={task} storyTitle={story?.title} statuses={projectStatuses} onStatusChange={updateTaskStatus} />
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
                      <span className="text-ui-xs text-stone-400 whitespace-nowrap">
                        {t('project_statuses.unlisted')}
                      </span>
                      <div className="w-px bg-stone-200 dark:bg-stone-700 self-stretch" />
                    </div>
                    {unlistedSlugs.map((slug) => {
                      const columnTasks = filteredBoardTasks.filter(({ task }) => task.status === slug)
                      return (
                        <div key={slug} className="w-[272px] shrink-0 snap-start">
                          <div className="flex items-center gap-2 px-1 mb-2">
                            <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600" />
                            <span className="text-ui-sm font-medium text-stone-400 font-mono">{slug}</span>
                            <span className="text-ui-xs text-stone-400 tabular-nums">{columnTasks.length}</span>
                          </div>
                          <div className="space-y-1.5">
                            {columnTasks.map(({ task, story }) => (
                              <BoardCard key={task.id} task={task} storyTitle={story?.title} statuses={projectStatuses} onStatusChange={updateTaskStatus} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )
              })()}
            </div>
          </div>
            <DragOverlay>
              {activeTaskId ? (() => {
                const found = allTasks.find(({ task }) => task.id === activeTaskId)
                return found ? <BoardCard task={found.task} storyTitle={found.story?.title} statuses={projectStatuses} onStatusChange={updateTaskStatus} dragOverlay /> : null
              })() : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {/* Stories tab */}
      {tab === 'stories' && (
        <div className="flex-1 px-4 md:px-7 py-5">
          {storiesHook.items.length === 0 ? (
            <EmptyState
              message={t('stories.empty')}
              action={isManager ? { label: t('stories.create'), onClick: () => setShowCreateStory(true) } : undefined}
            />
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <input
                  type="text"
                  aria-label={t('filter.search')}
                  placeholder={t('filter.search')}
                  value={storySearch}
                  onChange={e => setStorySearch(e.target.value)}
                  className="w-40 px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                />
                <select
                  aria-label={t('filter.status')}
                  value={storyFilterStatus}
                  onChange={e => setStoryFilterStatus(e.target.value as Status | 'all')}
                  className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="all">{t('filter.all')} {t('filter.status')}</option>
                  {statuses.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
                <select
                  aria-label={t('filter.priority')}
                  value={storyFilterPriority}
                  onChange={e => setStoryFilterPriority(e.target.value as Priority | 'all')}
                  className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="all">{t('filter.all')} {t('filter.priority')}</option>
                  {priorities.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
                <select
                  aria-label="Sort by"
                  value={storySortField}
                  onChange={e => setStorySortField(e.target.value as StorySortField)}
                  className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  <option value="created_at">{t('sort.created')}</option>
                  <option value="status">{t('sort.status')}</option>
                  <option value="priority">{t('sort.priority')}</option>
                  <option value="title">{t('sort.title')}</option>
                </select>
                <button
                  onClick={() => setStorySortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  aria-label={storySortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950"
                >
                  {storySortDir === 'asc' ? '↑' : '↓'}
                </button>
                <span className="flex-1" />
                <span className="text-ui-sm text-stone-400 tabular-nums">
                  {t('toolbar.tasks_count', { count: totalTaskCount })} · {t('toolbar.stories_count', { count: storiesHook.items.length })}
                </span>
              </div>

              {/* Stories table */}
              {filteredStories.length === 0 ? (
                <p className="text-ui-md text-stone-400 py-8 text-center">{t('filter.no_results')}</p>
              ) : (
                <DndContext
                  sensors={boardSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleStoriesDragStart}
                  onDragEnd={handleStoriesDragEnd}
                >
                  <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
                    <div className="hidden md:grid stories-grid md:grid-cols-[1fr_120px_100px_100px_80px] px-4 py-2 text-ui-xs uppercase tracking-wider text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30">
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
                          <div className="grid stories-grid md:grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <Link
                                  to={`/projects/${id}/stories/${story.id}`}
                                  className="text-ui-md font-medium hover:accent-text min-w-0 line-clamp-1 md:line-clamp-none"
                                >
                                  {story.title}
                                </Link>
                                {story.is_default && (
                                  <span className="shrink-0 text-ui-2xs uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500">
                                    {t('stories.backlog')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                              {story.is_default
                                ? <span className="text-ui-xs text-stone-300 dark:text-stone-700">—</span>
                                : <StatusPill status={story.status} statuses={projectStatuses} />}
                              {story.is_default
                                ? <span className="text-ui-xs text-stone-300 dark:text-stone-700">—</span>
                                : <PriorityBars priority={story.priority} withLabel />}
                              <span className="text-ui-sm text-stone-500">{tasksByStory[story.id]?.length ?? '…'}</span>
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-ui-xs text-stone-400">{formatRelative(story.created_at)}</span>
                                {isManager && (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditStory({ id: story.id, title: story.title, description: story.description ?? '' })}
                                      className="text-ui-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 tap-safe"
                                    >
                                      {t('actions.edit')}
                                    </button>
                                    {!story.is_default && (
                                      <button
                                        onClick={() => setDeleteStoryId(story.id)}
                                        className="text-ui-xs text-rose-400 hover:text-rose-600 tap-safe"
                                      >
                                        {t('actions.delete')}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
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
                                    <span className="min-w-0 block text-ui-sm text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                                    <StatusPill status={task.status} statuses={projectStatuses} />
                                    <PriorityBars priority={task.priority} withLabel />
                                    <span className="hidden md:inline" />
                                    <span className="text-ui-xs text-stone-400 text-right">{formatRelative(task.created_at)}</span>
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
                          <span className="min-w-0 block text-ui-sm text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                          <StatusPill status={task.status} statuses={projectStatuses} />
                          <PriorityBars priority={task.priority} withLabel />
                          <span className="hidden md:inline" />
                          <span className="text-ui-xs text-stone-400 text-right">{formatRelative(task.created_at)}</span>
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
                className="px-2.5 py-1.5 text-ui-sm rounded-md accent-bg inline-flex items-center gap-1.5 tap-safe"
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
                    <div className="text-ui-lg font-medium">{m.name}</div>
                    <div className="text-ui-sm text-stone-500">{m.email}</div>
                  </div>
                  <span className="text-ui-sm text-stone-500">{t(`role.${m.role}`)}</span>
                  {isManager && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-ui-sm text-rose-500 hover:text-rose-700 tap-safe"
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

      <Modal
        open={showCreateStory}
        onClose={closeCreateStory}
        title={t('stories.create')}
        size="lg"
        onSubmit={handleCreateStory}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeCreateStory} className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 tap-safe">
              {t('actions.cancel')}
            </button>
            <button type="submit" disabled={creatingStory} className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe">
              {t('actions.create')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            type="text"
            placeholder={t('board.col_title')}
            value={newStoryTitle}
            onChange={(e) => setNewStoryTitle(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
          />
          <MarkdownEditor
            value={newStoryDescription}
            onChange={setNewStoryDescription}
            rows={4}
            placeholder={t('tasks.description')}
            autoExpand
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="pdp-create-story-status" className="text-ui-sm font-medium text-stone-500">{t('filter.status')}</label>
              <select
                id="pdp-create-story-status"
                value={newStoryStatus}
                onChange={(e) => setNewStoryStatus(e.target.value as Status)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
              >
                {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="pdp-create-story-priority" className="text-ui-sm font-medium text-stone-500">{t('filter.priority')}</label>
              <select
                id="pdp-create-story-priority"
                value={newStoryPriority}
                onChange={(e) => setNewStoryPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
              >
                {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title={t('members.invite')}
        onSubmit={handleInvite}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowInvite(false)} className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 tap-safe">
              {t('actions.cancel')}
            </button>
            <button type="submit" disabled={inviting} className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe">
              {t('members.invite')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            type="email"
            placeholder={t('members.email')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
          >
            <option value="contributor">{t('role.contributor')}</option>
            <option value="manager">{t('role.manager')}</option>
          </select>
        </div>
      </Modal>

      <Modal
        open={editStory !== null}
        onClose={() => setEditStory(null)}
        title={t('actions.edit')}
        onSubmit={handleSaveStory}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditStory(null)} className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 tap-safe">
              {t('actions.cancel')}
            </button>
            <button type="submit" disabled={savingStory} className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe">
              {t('actions.save')}
            </button>
          </div>
        }
      >
        {editStory && (
          <div className="space-y-4">
            <input
              type="text"
              value={editStory.title}
              onChange={(e) => setEditStory({ ...editStory, title: e.target.value })}
              required
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
            />
            <MarkdownEditor value={editStory.description} onChange={(v) => setEditStory({ ...editStory, description: v })} rows={3} autoExpand />
          </div>
        )}
      </Modal>

      {deleteStoryId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={`Delete story "${storiesHook.items.find(s => s.id === deleteStoryId)?.title ?? ''}"?`}
          onConfirm={async () => {
            await storiesApi.delete(deleteStoryId)
            setDeleteStoryId(null)
            storiesHook.refresh()
            addToast(t('stories.deleted'))
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
