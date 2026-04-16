import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invitationsApi } from '../services/api'
import type { InvitationResponse } from '../services/api'
import { EmptyState } from '../components/common/EmptyState'
import { SkeletonCard } from '../components/common/Skeleton'
import { useToast } from '../context/ToastContext'
import i18n from '../i18n'
import { formatDate } from '../utils/format'

export function InvitationsPage() {
  const { t } = useTranslation()
  const { addToast } = useToast()
  const [invitations, setInvitations] = useState<InvitationResponse[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    invitationsApi.mine().then((res) => {
      setInvitations(res.data.filter((i) => i.status === 'pending'))
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAccept = async (id: string) => {
    await invitationsApi.accept(id)
    addToast('Invitation accepted')
    load()
  }

  const handleDecline = async (id: string) => {
    await invitationsApi.decline(id)
    addToast('Invitation declined')
    load()
  }

  if (loading) return (
    <div className="space-y-3 mt-6">
      {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('invitations.title')}</h1>
      {invitations.length === 0 ? (
        <EmptyState message={t('invitations.empty')} />
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4 flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-medium text-sm">{inv.project_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300">
                  {t('invitations.invited_by')}: {inv.inviter_name} &middot; {t('invitations.role_offered')}: {t(`role.${inv.role}`)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                  {t('invitations.expires')}: {formatDate(inv.expires_at, i18n.language)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(inv.id)}
                  className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md"
                >
                  {t('invitations.accept')}
                </button>
                <button
                  onClick={() => handleDecline(inv.id)}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {t('invitations.decline')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
