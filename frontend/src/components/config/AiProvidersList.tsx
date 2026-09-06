import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { configApi, isDemoBlockedError } from '../../services/api'
import type { LlmProviderCatalogueItem, UserLlmProviderResponse, UserLlmProviderUpdate } from '../../services/api'
import { getApiErrorMessage } from '../../utils/errors'
import { ConfirmDialog } from '../common/ConfirmDialog'

interface RowProps {
  provider: LlmProviderCatalogueItem
  userRow: UserLlmProviderResponse | undefined
  onChanged: () => void
}

function ProviderRow({ provider, userRow, onChanged }: RowProps) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  // Initialised from userRow, but never re-synced from it on prop changes — the
  // parent forces a remount (via a `key` that includes the row's persisted
  // values) whenever a save/clear actually changes what's on the server, so
  // this component never needs an effect just to catch up with its own props.
  const [model, setModel] = useState(userRow?.model ?? '')
  const [rpm, setRpm] = useState(userRow?.rpm_limit != null ? String(userRow.rpm_limit) : '')
  const [tpm, setTpm] = useState(userRow?.tpm_limit != null ? String(userRow.tpm_limit) : '')
  const [isDefault, setIsDefault] = useState(userRow?.is_default ?? false)
  // Only true once the user actually clicks the checkbox this session — is_default
  // must be opt-in on every PATCH (mirroring the CLI, T18), otherwise a stale value
  // read on mount silently clobbers a default just set from another client.
  const [defaultTouched, setDefaultTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const data: UserLlmProviderUpdate = {}
      if (defaultTouched) data.is_default = isDefault
      if (apiKey.trim()) data.api_key = apiKey.trim()
      if (model.trim()) data.model = model.trim()
      // A NaN here would serialize to `null`, which the backend reads as "field not
      // provided" — silently discarding the user's change instead of surfacing it.
      if (rpm.trim()) {
        const n = Number(rpm)
        if (Number.isNaN(n)) {
          setError(t('ai_providers.invalid_number'))
          return
        }
        data.rpm_limit = n
      }
      if (tpm.trim()) {
        const n = Number(tpm)
        if (Number.isNaN(n)) {
          setError(t('ai_providers.invalid_number'))
          return
        }
        data.tpm_limit = n
      }
      await configApi.setLlmProvider(provider.id, data)
      onChanged()
    } catch (e) {
      if (!isDemoBlockedError(e)) setError(getApiErrorMessage(e) ?? t('errors.generic'))
    } finally {
      // Cleared on both success and failure — a rejected key must never sit in the DOM.
      setApiKey('')
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setConfirmClear(false)
    setClearing(true)
    setError(null)
    try {
      await configApi.deleteLlmProvider(provider.id)
      onChanged()
    } catch (e) {
      if (!isDemoBlockedError(e)) setError(getApiErrorMessage(e) ?? t('errors.generic'))
    } finally {
      setClearing(false)
    }
  }

  if (!provider.available) {
    return (
      <div className="rounded-lg border border-dashed border-stone-200 dark:border-stone-700 p-4 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-ui-md">{provider.label}</span>
          <span className="text-ui-xs uppercase tracking-wider text-stone-400 border border-stone-300 dark:border-stone-600 rounded-full px-2 py-0.5 shrink-0">
            {t('ai_providers.coming_soon')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="font-medium text-ui-md">{provider.label}</span>
        <span className="text-ui-xs text-stone-500 dark:text-stone-400">
          {userRow ? t('ai_providers.configured', { hint: userRow.api_key_hint }) : t('ai_providers.not_configured')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${provider.id}-api-key`} className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
            {t('ai_providers.api_key_label')}
          </label>
          <input
            id={`${provider.id}-api-key`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider.key_hint}
            autoComplete="off"
            className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
        </div>
        <div>
          <label htmlFor={`${provider.id}-model`} className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
            {t('ai_providers.model_label')}
          </label>
          <input
            id={`${provider.id}-model`}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider.default_model}
            className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
        </div>
        <div>
          <label htmlFor={`${provider.id}-rpm`} className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
            {t('ai_providers.rpm_label')}
          </label>
          <input
            id={`${provider.id}-rpm`}
            type="number"
            min={0}
            value={rpm}
            onChange={(e) => setRpm(e.target.value)}
            className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          {userRow && (
            <p className="text-ui-xs text-stone-400 mt-1">{t('ai_providers.max_helper', { value: userRow.effective_rpm })}</p>
          )}
        </div>
        <div>
          <label htmlFor={`${provider.id}-tpm`} className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
            {t('ai_providers.tpm_label')}
          </label>
          <input
            id={`${provider.id}-tpm`}
            type="number"
            min={0}
            value={tpm}
            onChange={(e) => setTpm(e.target.value)}
            className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
          {userRow && (
            <p className="text-ui-xs text-stone-400 mt-1">{t('ai_providers.max_helper', { value: userRow.effective_tpm })}</p>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => {
            setIsDefault(e.target.checked)
            setDefaultTouched(true)
          }}
          className="accent-[var(--accent)]"
        />
        <span className="text-ui-sm">{t('ai_providers.default_label')}</span>
      </label>

      {error && <p className="text-ui-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-ui-sm rounded-md accent-bg text-white disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {userRow && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={clearing}
            className="px-4 py-1.5 text-ui-sm rounded-md border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50"
          >
            {t('ai_providers.clear')}
          </button>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog
          title={t('ai_providers.clear_confirm_title')}
          description={t('ai_providers.clear_confirm_desc')}
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
          confirmLabel={t('ai_providers.clear')}
        />
      )}
    </div>
  )
}

export function AiProvidersList() {
  const { t } = useTranslation()
  const [catalogue, setCatalogue] = useState<LlmProviderCatalogueItem[]>([])
  const [userRows, setUserRows] = useState<UserLlmProviderResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Bumped on every successful reload so each row's `key` changes even when the
  // persisted values it fetched are identical to before — e.g. a requested RPM
  // that the backend clamps right back down to what was already stored. Without
  // this, React sees an unchanged key, skips the remount, and a row can keep
  // showing the user's rejected input as if it had been saved. Left untouched on
  // a failed reload, so a row still showing its last-known-good data isn't
  // needlessly remounted.
  const [loadVersion, setLoadVersion] = useState(0)

  // No setState directly in the body — only inside the promise callbacks — so
  // this stays safe to call synchronously from the mount effect below.
  const load = useCallback(() => {
    Promise.all([configApi.availableLlmProviders(), configApi.listLlmProviders()])
      .then(([cat, rows]) => {
        setCatalogue(cat.data)
        setUserRows(rows.data)
        setLoadError(null)
        setLoadVersion((v) => v + 1)
      })
      .catch((e) => {
        setLoadError(getApiErrorMessage(e) ?? t('errors.generic'))
      })
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="animate-pulse h-10 bg-stone-100 dark:bg-stone-700 rounded" />

  if (loadError) {
    return <p className="text-ui-sm text-red-500">{loadError}</p>
  }

  return (
    <div className="space-y-3">
      {catalogue.map((provider) => {
        const userRow = userRows.find((r) => r.provider === provider.id)
        return (
          <ProviderRow
            // Fingerprint of the persisted (non-secret) fields plus loadVersion —
            // changes on every successful reload (even a same-value clamp), forcing
            // a clean remount instead of an effect.
            key={`${provider.id}:${loadVersion}:${userRow ? `${userRow.model}:${userRow.rpm_limit}:${userRow.tpm_limit}:${userRow.is_default}` : 'unconfigured'}`}
            provider={provider}
            userRow={userRow}
            onChanged={load}
          />
        )
      })}
      <p className="text-ui-xs text-stone-400 dark:text-stone-500 pt-1">{t('ai_providers.privacy_note')}</p>
    </div>
  )
}
