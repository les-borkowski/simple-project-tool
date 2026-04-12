import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { projectsApi, invitationsApi, storiesApi } from '../services/api'
import type { ProjectResponse, MemberResponse, Status, Role } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useStories } from '../hooks/useStories'
import { StatusBadge } from '../components/common/StatusBadge'
import { PriorityBadge } from '../components/common/PriorityBadge'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { EmptyState } from '../components/common/EmptyState'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

type Tab = 'stories' | 'members'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isManager } = useRole(id)

  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('stories')
  const [members, setMembers] = useState<MemberResponse[]>([])
  const [editingStatus, setEditingStatus] = useState(false)

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

  const handleStatusChange = async (status: Status) => {
    if (!id) return
    const res = await projectsApi.update(id, { status })
    setProject(res.data)
    setEditingStatus(false)
  }

  const handleArchive = async () => {
    if (!id) return
    if (project?.archived_at) {
      await projectsApi.restore(id)
    } else {
      await projectsApi.archive(id)
    }
    const res = await projectsApi.get(id)
    setProject(res.data)
  }

  const handleDeleteProject = async () => {
    if (!id) return
    await projectsApi.delete(id)
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
      storiesHook.refresh()
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
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!id) return
    await projectsApi.removeMember(id, userId)
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
  }

  const statuses: Status[] = ['to_do', 'in_progress', 'in_review', 'in_testing', 'done']

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
  }
  if (!project) return null

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
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
            <PriorityBadge priority={project.priority} />
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
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {(['stories', 'members'] as Tab[]).map((t_) => (
            <button
              key={t_}
              onClick={() => setTab(t_)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t_
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
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
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowCreateStory(true)}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
            >
              {t('stories.create')}
            </button>
          </div>
          {storiesHook.items.length === 0 ? (
            <EmptyState message={t('stories.empty')} />
          ) : (
            <div className="space-y-2">
              {storiesHook.items.map((story) => (
                <div
                  key={story.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/projects/${id}/stories/${story.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {story.title}
                    </Link>
                    <div className="flex gap-2 mt-1">
                      <StatusBadge status={story.status} />
                      <PriorityBadge priority={story.priority} />
                    </div>
                  </div>
                  {isManager && (
                    <button
                      onClick={() => setDeleteStoryId(story.id)}
                      className="text-sm text-red-500 hover:text-red-700 shrink-0"
                    >
                      {t('actions.delete')}
                    </button>
                  )}
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
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
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
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-sm">{m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t(`role.${m.role}`)}</span>
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
                <button type="submit" disabled={creatingStory} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50">
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
                <button type="submit" disabled={inviting} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50">
                  {t('members.invite')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteStoryId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          onConfirm={async () => {
            await storiesApi.delete(deleteStoryId)
            setDeleteStoryId(null)
            storiesHook.refresh()
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
