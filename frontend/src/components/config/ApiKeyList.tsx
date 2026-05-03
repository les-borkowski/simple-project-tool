import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { configApi } from '../../services/api'
import type { ApiKeyResponse } from '../../services/api'
import { EmptyState } from '../common/EmptyState'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { formatDate } from '../../utils/format'
import i18n from '../../i18n'

const ALL_SCOPES = [
  'read:projects', 'write:projects',
  'read:stories', 'write:stories',
  'read:tasks', 'write:tasks',
  'read:comments', 'write:comments',
  'admin',
]

export function ApiKeyList() {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ApiKeyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newScopes, setNewScopes] = useState<string[]>(['read:projects'])
  const [creating, setCreating] = useState(false)
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const load = () => {
    configApi.listApiKeys().then((res) => setKeys(res.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await configApi.createApiKey({ label: newLabel, scopes: newScopes })
      setRawKey(res.data.key)
      setShowCreate(false)
      setNewLabel('')
      setNewScopes(['read:projects'])
      load()
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeId) return
    await configApi.revokeApiKey(revokeId)
    setRevokeId(null)
    load()
  }

  const toggleScope = (scope: string) => {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  if (loading) return <div className="animate-pulse h-10 bg-stone-100 dark:bg-stone-700 rounded" />

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm accent-bg rounded-md"
        >
          {t('api_keys.create')}
        </button>
      </div>

      {keys.length === 0 ? (
        <EmptyState message={t('api_keys.empty')} />
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="bg-white dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-600 p-4 flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-medium text-sm">{key.label}</p>
                <p className="text-xs text-stone-500 dark:text-stone-300 mt-0.5">
                  {key.scopes.join(', ')}
                </p>
                <p className="text-xs text-stone-400 dark:text-stone-400 mt-0.5">
                  {t('api_keys.last_used')}: {key.last_used_at ? formatDate(key.last_used_at, i18n.language) : t('api_keys.never')}
                </p>
              </div>
              <button
                onClick={() => setRevokeId(key.id)}
                className="text-sm text-red-500 hover:text-red-700 shrink-0"
              >
                {t('api_keys.revoke')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Raw key modal */}
      {rawKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">{t('api_keys.create')}</h3>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">{t('api_keys.copy_warning')}</p>
            <code className="block w-full bg-stone-100 dark:bg-stone-700 rounded p-3 text-sm font-mono break-all mb-4">
              {rawKey}
            </code>
            <button
              onClick={() => setRawKey(null)}
              className="w-full py-2 text-sm accent-bg rounded-md"
            >
              {t('actions.confirm')}
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('api_keys.create')}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('api_keys.label')}</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('api_keys.scopes')}</label>
                <div className="space-y-1">
                  {ALL_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-md">{t('actions.cancel')}</button>
                <button type="submit" disabled={creating} className="px-4 py-2 text-sm accent-bg rounded-md disabled:opacity-50">{t('actions.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeId && (
        <ConfirmDialog
          title={t('actions.confirm')}
          description={t('api_keys.revoke') + '?'}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeId(null)}
          confirmLabel={t('api_keys.revoke')}
        />
      )}
    </div>
  )
}
