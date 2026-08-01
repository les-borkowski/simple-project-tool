import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invitationsApi, isDemoBlockedError } from '../services/api'
import type { InvitationResponse } from '../services/api'
import { EmptyState } from '../components/common/EmptyState'
import { SkeletonCard } from '../components/common/Skeleton'
import { PageHeader } from '../components/layout/PageHeader'
import { useToast } from '../context/ToastContext'
import i18n from '../i18n'
import { formatDate } from '../utils/format'
import { initials } from '../utils/initials'

const ICheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m5 12 5 5L20 7"/>
  </svg>
)
const IDecline = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)

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
    try {
      await invitationsApi.accept(id)
      addToast(t('invitations.accepted'), 'success')
      load()
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.generic'), 'error')
    }
  }

  const handleDecline = async (id: string) => {
    try {
      await invitationsApi.decline(id)
      addToast(t('invitations.declined'), 'success')
      load()
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('errors.generic'), 'error')
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader title={t('invitations.title')} subtitle={t('inbox.subtitle')} />

      <div className="px-7 py-5 flex-1">
        {loading ? (
          <div className="space-y-3 max-w-2xl">
            {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : invitations.length === 0 ? (
          <EmptyState message={t('invitations.empty')} />
        ) : (
          <div className="space-y-2 max-w-2xl">
            {invitations.map((inv) => {
              const projInitials = initials(inv.project_name)
              return (
                <div
                  key={inv.id}
                  className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 flex items-center gap-4"
                >
                  <span className="w-10 h-10 rounded-lg accent-soft inline-flex items-center justify-center font-mono text-ui-xs accent-text font-semibold shrink-0">
                    {projInitials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-ui-lg font-medium">{inv.project_name}</div>
                    <div className="text-ui-sm text-stone-500 mt-0.5">
                      {t('invitations.invited_by')}: {inv.inviter_name} &middot; {t('invitations.role_offered')}: <span className="text-stone-700 dark:text-stone-300">{t(`role.${inv.role}`)}</span>
                    </div>
                    <div className="text-ui-xs text-stone-400 mt-0.5">
                      {t('invitations.expires')}: {formatDate(inv.expires_at, i18n.language)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleDecline(inv.id)}
                      className="px-2.5 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 inline-flex items-center gap-1.5 text-stone-600 dark:text-stone-300"
                    >
                      <IDecline /> {t('invitations.decline')}
                    </button>
                    <button
                      onClick={() => handleAccept(inv.id)}
                      className="px-2.5 py-1.5 text-ui-sm rounded-md accent-bg inline-flex items-center gap-1.5"
                    >
                      <ICheck /> {t('invitations.accept')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
