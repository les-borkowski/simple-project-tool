import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectsApi, invitationsApi, storiesApi, tasksApi } from '../services/api'
import type { ProjectResponse, MemberResponse, StoryResponse, TaskResponse, Status, Priority, Role } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useStories } from '../hooks/useStories'
import { StatusPill } from '../components/common/StatusPill'
import { PriorityBars } from '../components/common/PriorityBars'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'

type Tab = 'board' | 'stories' | 'members'

const STATUSES: { id: Status; label: string }[] = [
  { id: 'to_do',       label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review',   label: 'In review' },
  { id: 'in_testing',  label: 'In testing' },
  { id: 'done',        label: 'Done' },
]

const STATUS_VARS: Record<Status, string> = {
  to_do: '--st-todo', in_progress: '--st-prog', in_review: '--st-rev',
  in_testing: '--st-test', done: '--st-done',
}

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

function BoardCard({ task, storyTitle }: { task: TaskResponse; storyTitle: string }) {
  return (
    <Link
      to={`/stories/${task.story_id}/tasks/${task.id}`}
      className="lift block bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 p-3 hover:border-stone-300 dark:hover:border-stone-700"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <PriorityBars priority={task.priority} />
        <span className="text-[10.5px] text-stone-400">{formatRelative(task.created_at)}</span>
      </div>
      <div className="text-[13px] leading-snug">{task.title}</div>
      <div className="flex items-center gap-2 mt-2.5">
        <span className="text-[10.5px] text-stone-400 truncate flex-1">{storyTitle}</span>
      </div>
    </Link>
  )
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isManager } = useRole(id)
  const { addToast } = useToast()

  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('board')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingPriority, setEditingPriority] = useState(false)

  const storiesHook = useStories(id ?? '')

  const [showCreateStory, setShowCreateStory] = useState(false)
  const [newStoryTitle, setNewStoryTitle] = useState('')
  const [creatingStory, setCreatingStory] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('contributor')
  const [inviting, setInviting] = useState(false)

  const [deleteStoryId, setDeleteStoryId] = useState<string | null>(null)
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false)
  const [editStory, setEditStory] = useState<{ id: string; title: string; description: string } | null>(null)
  const [savingStory, setSavingStory] = useState(false)
  const [tasksByStory, setTasksByStory] = useState<Record<string, TaskResponse[]>>({})

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

  useEffect(() => {
    const stories = storiesHook.items
    if (stories.length === 0) return
    stories.forEach((story) => {
      if (tasksByStory[story.id] !== undefined) return
      tasksApi.list(story.id, { limit: 25 }).then((res) => {
        setTasksByStory((prev) => ({ ...prev, [story.id]: res.data.items }))
      }).catch(() => {
        setTasksByStory((prev) => ({ ...prev, [story.id]: [] }))
      })
    })
  }, [storiesHook.items, tasksByStory])

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
      await storiesApi.create(id, { title: newStoryTitle })
      setShowCreateStory(false)
      setNewStoryTitle('')
      setTasksByStory({})
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
  const allTasks: Array<{ task: TaskResponse; story: StoryResponse }> = storiesHook.items.flatMap((story) =>
    (tasksByStory[story.id] ?? []).map((task) => ({ task, story }))
  )

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
                  <StatusPill status={project.status} />
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
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-500">Archived</span>
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
                  <IUser /> Invite
                </button>
                <button
                  onClick={() => setShowCreateStory(true)}
                  className="px-2.5 py-1.5 text-[12px] rounded-md accent-bg inline-flex items-center gap-1.5"
                >
                  <IPlus /> {t('stories.create')}
                </button>
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
          {([
            ['board', 'Board', <IBoard key="b" />],
            ['stories', 'Stories', <IList key="s" />],
            ['members', 'Members', <IUser key="m" />],
          ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 -mb-px flex items-center gap-1.5 border-b-2 ${tab === key ? 'border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
            >
              <span className="text-stone-400">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Board tab */}
      {tab === 'board' && (
        <div className="flex-1 overflow-x-auto scroll-hidden bg-stone-50 dark:bg-stone-950/50 fine-grid">
          <div className="flex gap-3 px-7 py-5 min-w-min min-h-full">
            {STATUSES.map((s) => {
              const columnTasks = allTasks.filter(({ task }) => task.status === s.id)
              return (
                <div key={s.id} className="w-[272px] shrink-0">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: `var(${STATUS_VARS[s.id]})` }} />
                    <span className="text-[12px] font-medium">{s.label}</span>
                    <span className="text-[11px] text-stone-400 tabular-nums">{columnTasks.length}</span>
                    <span className="flex-1" />
                    <button
                      onClick={() => setShowCreateStory(true)}
                      className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    >
                      <IPlus />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {columnTasks.map(({ task, story }) => (
                      <BoardCard key={task.id} task={task} storyTitle={story.title} />
                    ))}
                    {columnTasks.length === 0 && (
                      <div className="h-16 rounded-lg border border-dashed border-stone-200 dark:border-stone-800" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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
              <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
                <div className="grid grid-cols-[1fr_120px_100px_100px_80px] px-4 py-2 text-[10.5px] uppercase tracking-wider text-stone-400 font-medium border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30">
                  <span>Title</span>
                  <span>Status</span>
                  <span>Priority</span>
                  <span>Tasks</span>
                  <span className="text-right">Updated</span>
                </div>
                {storiesHook.items.map((story) => (
                  <div key={story.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <div className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                      <div className="min-w-0">
                        <Link
                          to={`/projects/${id}/stories/${story.id}`}
                          className="text-[13px] font-medium hover:accent-text"
                        >
                          {story.title}
                        </Link>
                      </div>
                      <StatusPill status={story.status} />
                      <PriorityBars priority={story.priority} withLabel />
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
                            <button
                              onClick={() => setDeleteStoryId(story.id)}
                              className="text-[11px] text-rose-400 hover:text-rose-600"
                            >
                              {t('actions.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Tasks inline */}
                    {tasksByStory[story.id] && tasksByStory[story.id].length > 0 && (
                      <div className="border-t border-stone-50 dark:border-stone-800/60">
                        {tasksByStory[story.id].map((task) => (
                          <Link
                            key={task.id}
                            to={`/stories/${story.id}/tasks/${task.id}`}
                            className="grid grid-cols-[1fr_120px_100px_100px_80px] items-center px-4 py-1.5 pl-8 bg-stone-50/60 dark:bg-stone-900/20 hover:bg-stone-100/60 dark:hover:bg-stone-900/40 border-t border-stone-100/60 dark:border-stone-800/40 first:border-t-0"
                          >
                            <span className="text-[12px] text-stone-600 dark:text-stone-400 truncate">{task.title}</span>
                            <StatusPill status={task.status} />
                            <PriorityBars priority={task.priority} withLabel />
                            <span />
                            <span className="text-[11px] text-stone-400 text-right">{formatRelative(task.created_at)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {storiesHook.nextCursor && (
                <LoadMoreButton onLoadMore={storiesHook.loadMore} isLoading={storiesHook.isLoading} />
              )}
            </>
          )}
        </div>
      )}

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

      {/* Modals */}
      {showCreateStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 max-w-md w-full mx-4">
            <h3 className="text-[15px] font-semibold mb-4">{t('stories.create')}</h3>
            <form onSubmit={handleCreateStory} className="space-y-4">
              <input
                type="text"
                placeholder={t('tasks.title')}
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateStory(false)} className="px-3 py-1.5 text-[12.5px] border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800">
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
              <MarkdownEditor value={editStory.description} onChange={(v) => setEditStory({ ...editStory, description: v })} rows={3} />
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
