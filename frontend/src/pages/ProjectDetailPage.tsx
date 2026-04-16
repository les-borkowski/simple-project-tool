import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectsApi, invitationsApi, storiesApi, tasksApi } from '../services/api'
import type { ProjectResponse, MemberResponse, TaskResponse, Status, Priority, Role } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useStories } from '../hooks/useStories'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { MarkdownEditor } from '../components/common/MarkdownEditor'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import { formatRelative } from '../utils/time'

type Tab = 'stories' | 'members'

type SortField = 'created_at' | 'status' | 'priority' | 'title'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, in_testing: 3, done: 4 }
const PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 }

function applySortField<T extends { created_at: string; status: string; priority: string; title: string }>(
  a: T, b: T, field: SortField
): number {
  if (field === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (field === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (field === 'title') return a.title.localeCompare(b.title)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isManager } = useRole(id)
  const { addToast } = useToast()

  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('stories')
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
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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
      if (tasksByStory[story.id] !== undefined) return // already loaded
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
      setTasksByStory({}) // reset so new story's tasks load fresh
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

  if (loading) {
    return (
      <div className="space-y-3 mt-6">
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!project) return null

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 dark:text-gray-300 mb-4">
        <Link to="/projects" className="hover:underline">{t('projects.title')}</Link>
        <span className="mx-2">/</span>
        <span>{project.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
          <div className="flex items-center gap-2">
            {editingStatus ? (
              <select
                autoFocus
                defaultValue={project.status}
                onChange={(e) => handleStatusChange(e.target.value as Status)}
                onBlur={() => setEditingStatus(false)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {statuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            ) : (
              <button onClick={() => setEditingStatus(true)}>
                <StatusBadge status={project.status} />
              </button>
            )}
            {editingPriority ? (
              <select
                autoFocus
                defaultValue={project.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                onBlur={() => setEditingPriority(false)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                {priorities.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
              </select>
            ) : (
              <button onClick={() => setEditingPriority(true)}>
                <PriorityBadge priority={project.priority} />
              </button>
            )}
          </div>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <button
              onClick={handleArchive}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {project.archived_at ? t('actions.restore') : t('actions.archive')}
            </button>
            <button
              onClick={() => setDeleteProjectConfirm(true)}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md"
            >
              {t('actions.delete')}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-600 mb-6">
        <nav className="flex gap-6">
          {(['stories', 'members'] as Tab[]).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t_
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200'
              }`}
            >
              {t(`tabs.${t_}`)}
            </button>
          ))}
        </nav>
      </div>

      {/* Stories tab */}
      {tab === 'stories' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-300">Sort by</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              >
                <option value="created_at">Created</option>
                <option value="status">Status</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
              </select>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
            <button
              onClick={() => setShowCreateStory(true)}
              className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md"
            >
              {t('stories.create')}
            </button>
          </div>
          {storiesHook.items.length === 0 ? (
            <EmptyState
              message={t('stories.empty')}
              action={isManager ? { label: t('stories.create'), onClick: () => setShowCreateStory(true) } : undefined}
            />
          ) : (
            <div className="space-y-2">
              {[...storiesHook.items].sort((a, b) => {
                const c = applySortField(a, b, sortField)
                return sortDir === 'asc' ? c : -c
              }).map((story) => (
                <div
                  key={story.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden"
                >
                  {/* Story header */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/projects/${id}/stories/${story.id}`}
                        className="font-medium text-sky-600 hover:underline"
                      >
                        {story.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={story.status} />
                        <PriorityBadge priority={story.priority} />
                        <span className="text-xs text-gray-400 dark:text-gray-400">{formatRelative(story.created_at)}</span>
                      </div>
                    </div>
                    {isManager && (
                      <div className="flex gap-3 shrink-0">
                        <button
                          onClick={() => setEditStory({ id: story.id, title: story.title, description: story.description ?? '' })}
                          className="text-sm text-sky-500 hover:text-sky-700"
                        >
                          {t('actions.edit')}
                        </button>
                        <button
                          onClick={() => setDeleteStoryId(story.id)}
                          className="text-sm text-red-500 hover:text-red-700"
                        >
                          {t('actions.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Tasks under this story */}
                  {tasksByStory[story.id] === undefined ? (
                    <div className="border-t border-gray-100 dark:border-gray-600 px-4 py-2">
                      <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  ) : tasksByStory[story.id].length > 0 ? (
                    <div className="border-t border-gray-100 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                      {tasksByStory[story.id].map((task) => (
                        <div key={task.id} className="px-4 py-2 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/60">
                          <Link
                            to={`/stories/${story.id}/tasks/${task.id}`}
                            className="text-sm text-gray-700 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 truncate"
                          >
                            {task.title}
                          </Link>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={task.status} />
                            <PriorityBadge priority={task.priority} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {storiesHook.nextCursor && (
            <LoadMoreButton onLoadMore={storiesHook.loadMore} isLoading={storiesHook.isLoading} />
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div>
          {isManager && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowInvite(true)}
                className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md"
              >
                {t('members.invite')}
              </button>
            </div>
          )}
          {members.length === 0 ? (
            <EmptyState message={t('members.empty')} />
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-300">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-300">{t(`role.${m.role}`)}</span>
                    {isManager && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        {t('actions.delete')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create story modal */}
      {showCreateStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('stories.create')}</h3>
            <form onSubmit={handleCreateStory} className="space-y-4">
              <input
                type="text"
                placeholder={t('projects.name')}
                value={newStoryTitle}
                onChange={(e) => setNewStoryTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateStory(false)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={creatingStory} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50">
                  {t('actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('members.invite')}</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <input
                type="email"
                placeholder={t('members.email')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="contributor">{t('role.contributor')}</option>
                <option value="manager">{t('role.manager')}</option>
              </select>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={inviting} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50">
                  {t('members.invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit story modal */}
      {editStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('actions.edit')}</h3>
            <form onSubmit={handleSaveStory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
                <input
                  type="text"
                  value={editStory.title}
                  onChange={(e) => setEditStory({ ...editStory, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('projects.description')}</label>
                <MarkdownEditor value={editStory.description} onChange={(v) => setEditStory({ ...editStory, description: v })} rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditStory(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md">
                  {t('actions.cancel')}
                </button>
                <button type="submit" disabled={savingStory} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50">
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
