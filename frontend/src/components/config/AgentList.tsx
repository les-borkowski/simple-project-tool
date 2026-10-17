import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { agentsApi, isDemoBlockedError } from '../../services/api'
import type { AgentResponse, ApiKeyResponse } from '../../services/api'
import { getApiErrorCode, getApiErrorMessage } from '../../utils/errors'
import { EmptyState } from '../common/EmptyState'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { Modal } from '../common/Modal'
import { BotBadge } from '../common/BotBadge'

// Mirrors ApiKeyList: no 'admin', since it expands to every scope below.
const ALL_SCOPES = [
  'read:projects', 'write:projects',
  'read:stories', 'write:stories',
  'read:tasks', 'write:tasks',
  'read:comments', 'write:comments',
]
const DEFAULT_SCOPES = ['read:projects', 'read:stories', 'read:tasks', 'read:comments']

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-ui-md'
const SECONDARY_BTN =
  'px-3 py-1.5 text-ui-sm rounded-md border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 tap-safe'
const PRIMARY_BTN = 'px-4 py-2 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe'

/** Never surfaces a raw error code: unknown codes fall back to the server message, then a generic one. */
function agentErrorMessage(e: unknown, t: TFunction): string {
  switch (getApiErrorCode(e)) {
    case 'AGENT_LIMIT_REACHED': return t('agents.limit_reached')
    case 'AGENT_NAME_TAKEN': return t('agents.name_taken')
    case 'AGENT_INACTIVE': return t('agents.agent_inactive')
    default: return getApiErrorMessage(e) ?? t('errors.generic')
  }
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-4 px-3 py-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-ui-sm text-red-700 dark:text-red-300"
    >
      {message}
    </div>
  )
}

function ScopePicker({ selected, onToggle }: { selected: string[]; onToggle: (scope: string) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="block text-ui-md font-medium mb-2">{t('agents.scopes')}</legend>
      <div className="space-y-1">
        {ALL_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-ui-md">
            <input type="checkbox" checked={selected.includes(scope)} onChange={() => onToggle(scope)} />
            {scope}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function toggle(list: string[], scope: string): string[] {
  return list.includes(scope) ? list.filter((s) => s !== scope) : [...list, scope]
}

export function AgentList() {
  const { t } = useTranslation()
  const [agents, setAgents] = useState<AgentResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScopes, setNewScopes] = useState<string[]>(DEFAULT_SCOPES)

  const [rawKey, setRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [deactivateId, setDeactivateId] = useState<string | null>(null)

  const [keyAgentId, setKeyAgentId] = useState<string | null>(null)
  const [keyLabel, setKeyLabel] = useState('')
  const [keyScopes, setKeyScopes] = useState<string[]>(DEFAULT_SCOPES)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [keysState, setKeysState] = useState<{ agentId: string; keys: ApiKeyResponse[] } | null>(null)
  // Latest requested agent: a slower response for a previously expanded agent must not overwrite it.
  const keysRequestRef = useRef<string | null>(null)
  const [keysLoading, setKeysLoading] = useState(false)
  const [revoke, setRevoke] = useState<{ agentId: string; keyId: string } | null>(null)

  const load = useCallback(() => {
    agentsApi
      .list()
      .then((res) => {
        setAgents(res.data)
        setError(null)
      })
      .catch(() => setError(t('errors.generic')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const loadKeys = useCallback((agentId: string) => {
    keysRequestRef.current = agentId
    setKeysLoading(true)
    agentsApi
      .listKeys(agentId)
      .then((res) => {
        if (keysRequestRef.current === agentId) setKeysState({ agentId, keys: res.data })
      })
      .catch(() => {
        if (keysRequestRef.current === agentId) setError(t('errors.generic'))
      })
      .finally(() => {
        if (keysRequestRef.current === agentId) setKeysLoading(false)
      })
  }, [t])

  // Demo blocks already raise a global toast, so they leave no inline message.
  const fail = (e: unknown, setter: (m: string) => void) => {
    if (!isDemoBlockedError(e)) setter(agentErrorMessage(e, t))
  }

  const closeCreate = () => {
    setShowCreate(false)
    setFormError(null)
    setNewName('')
    setNewScopes(DEFAULT_SCOPES)
  }

  const closeKeyForm = () => {
    setKeyAgentId(null)
    setFormError(null)
    setKeyLabel('')
    setKeyScopes(DEFAULT_SCOPES)
  }

  const showRawKey = (key: string) => {
    setCopied(false)
    setRawKey(key)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const res = await agentsApi.create({ name: newName.trim(), scopes: newScopes })
      showRawKey(res.data.key.key)
      closeCreate()
      load()
    } catch (err) {
      fail(err, setFormError)
    } finally {
      setBusy(false)
    }
  }

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyAgentId) return
    setBusy(true)
    setFormError(null)
    try {
      const res = await agentsApi.createKey(keyAgentId, { label: keyLabel.trim(), scopes: keyScopes })
      showRawKey(res.data.key)
      const id = keyAgentId
      closeKeyForm()
      load()
      if (expandedId === id) loadKeys(id)
    } catch (err) {
      fail(err, setFormError)
    } finally {
      setBusy(false)
    }
  }

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renameId || busy) return
    setBusy(true)
    setError(null)
    try {
      await agentsApi.rename(renameId, renameValue.trim())
      setRenameId(null)
      load()
    } catch (err) {
      fail(err, setError)
    } finally {
      setBusy(false)
    }
  }

  const handleDeactivate = async () => {
    if (!deactivateId || busy) return
    setBusy(true)
    setError(null)
    try {
      await agentsApi.deactivate(deactivateId)
      load()
    } catch (err) {
      fail(err, setError)
    } finally {
      setBusy(false)
      setDeactivateId(null)
    }
  }

  const handleReactivate = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await agentsApi.reactivate(id)
      load()
    } catch (err) {
      fail(err, setError)
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!revoke || busy) return
    setBusy(true)
    setError(null)
    try {
      await agentsApi.revokeKey(revoke.agentId, revoke.keyId)
      load()
      loadKeys(revoke.agentId)
    } catch (err) {
      fail(err, setError)
    } finally {
      setBusy(false)
      setRevoke(null)
    }
  }

  const toggleKeys = (id: string) => {
    if (expandedId === id) {
      keysRequestRef.current = null
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setKeysState(null)
    loadKeys(id)
  }

  const copyKey = async () => {
    if (!rawKey) return
    try {
      await navigator.clipboard.writeText(rawKey)
      setCopied(true)
    } catch {
      // Clipboard can be denied (insecure context); the key stays selectable on screen.
    }
  }

  if (loading) return <div className="animate-pulse h-10 bg-stone-100 dark:bg-stone-700 rounded" />

  const keyAgent = agents.find((a) => a.id === keyAgentId)

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} className={PRIMARY_BTN}>
          {t('agents.new')}
        </button>
      </div>

      {agents.length === 0 ? (
        <EmptyState message={t('agents.empty')} />
      ) : (
        <ul className="space-y-2">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="bg-white dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-600 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  {renameId === agent.id ? (
                    <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
                      <input
                        autoFocus
                        aria-label={t('agents.name')}
                        value={renameValue}
                        maxLength={100}
                        required
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenameId(null)
                        }}
                        className={`${INPUT_CLASS} w-56`}
                      />
                      <button type="submit" disabled={busy} className={SECONDARY_BTN}>{t('actions.save')}</button>
                      <button type="button" onClick={() => setRenameId(null)} className={SECONDARY_BTN}>
                        {t('actions.cancel')}
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ui-md break-all">{agent.name}</p>
                      <BotBadge />
                      <span
                        className={`text-ui-xs ${
                          agent.is_active
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {agent.is_active ? t('agents.active') : t('agents.inactive')}
                      </span>
                    </div>
                  )}
                  <p className="text-ui-xs text-stone-500 dark:text-stone-300 mt-0.5">
                    {t('agents.key_count', { count: agent.key_count })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    className={SECONDARY_BTN}
                    onClick={() => { setRenameId(agent.id); setRenameValue(agent.name) }}
                  >
                    {t('agents.rename')}
                  </button>
                  <button
                    className={SECONDARY_BTN}
                    disabled={!agent.is_active}
                    onClick={() => { setFormError(null); setKeyAgentId(agent.id) }}
                  >
                    {t('agents.new_key')}
                  </button>
                  <button
                    className={SECONDARY_BTN}
                    aria-expanded={expandedId === agent.id}
                    onClick={() => toggleKeys(agent.id)}
                  >
                    {expandedId === agent.id ? t('agents.hide_keys') : t('agents.keys')}
                  </button>
                  {agent.is_active ? (
                    <button
                      className={`${SECONDARY_BTN} text-red-600 dark:text-red-400`}
                      onClick={() => setDeactivateId(agent.id)}
                    >
                      {t('agents.deactivate')}
                    </button>
                  ) : (
                    <button className={SECONDARY_BTN} disabled={busy} onClick={() => handleReactivate(agent.id)}>
                      {t('agents.reactivate')}
                    </button>
                  )}
                </div>
              </div>

              {expandedId === agent.id && (
                <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-700">
                  {keysLoading && keysState?.agentId !== agent.id ? (
                    <div className="animate-pulse h-6 bg-stone-100 dark:bg-stone-700 rounded" />
                  ) : !keysState || keysState.agentId !== agent.id || keysState.keys.length === 0 ? (
                    <p className="text-ui-sm text-stone-500 dark:text-stone-300">{t('agents.no_keys')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {keysState.keys.map((key) => (
                        <li key={key.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-ui-md font-medium break-all">{key.label}</p>
                            <p className="text-ui-xs text-stone-500 dark:text-stone-300 break-words">
                              {key.scopes.join(', ')}
                            </p>
                          </div>
                          <button
                            className={`${SECONDARY_BTN} shrink-0 text-red-600 dark:text-red-400`}
                            onClick={() => setRevoke({ agentId: agent.id, keyId: key.id })}
                          >
                            {t('agents.revoke_key')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={rawKey !== null}
        onClose={() => setRawKey(null)}
        title={t('agents.key_created')}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={copyKey} className={SECONDARY_BTN}>
              {copied ? t('agents.copied') : t('agents.copy')}
            </button>
            <button type="button" onClick={() => setRawKey(null)} className={PRIMARY_BTN}>
              {t('actions.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-ui-md text-amber-600 dark:text-amber-400 mb-3">{t('api_keys.copy_warning')}</p>
        <code className="block w-full bg-stone-100 dark:bg-stone-700 rounded p-3 text-ui-md font-mono break-all">
          {rawKey}
        </code>
      </Modal>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title={t('agents.new')}
        onSubmit={handleCreate}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeCreate} className={SECONDARY_BTN}>{t('actions.cancel')}</button>
            <button
              type="submit"
              disabled={busy || !newName.trim() || newScopes.length === 0}
              className={PRIMARY_BTN}
            >
              {t('agents.create')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorBanner message={formError} />}
          <div>
            <label htmlFor="agent-name" className="block text-ui-md font-medium mb-1">{t('agents.name')}</label>
            <input
              id="agent-name"
              type="text"
              value={newName}
              maxLength={100}
              required
              onChange={(e) => setNewName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <ScopePicker selected={newScopes} onToggle={(s) => setNewScopes((p) => toggle(p, s))} />
          {newScopes.some((s) => s.startsWith('write:')) && (
            <p className="text-ui-sm text-amber-600 dark:text-amber-400">{t('agents.manager_warning')}</p>
          )}
        </div>
      </Modal>

      <Modal
        open={keyAgentId !== null}
        onClose={closeKeyForm}
        title={keyAgent ? `${t('agents.new_key')}: ${keyAgent.name}` : t('agents.new_key')}
        onSubmit={handleCreateKey}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeKeyForm} className={SECONDARY_BTN}>{t('actions.cancel')}</button>
            <button
              type="submit"
              disabled={busy || !keyLabel.trim() || keyScopes.length === 0}
              className={PRIMARY_BTN}
            >
              {t('actions.create')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && <ErrorBanner message={formError} />}
          <div>
            <label htmlFor="agent-key-label" className="block text-ui-md font-medium mb-1">{t('agents.key_label')}</label>
            <input
              id="agent-key-label"
              type="text"
              value={keyLabel}
              maxLength={100}
              required
              onChange={(e) => setKeyLabel(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <ScopePicker selected={keyScopes} onToggle={(s) => setKeyScopes((p) => toggle(p, s))} />
          {keyScopes.some((s) => s.startsWith('write:')) && (
            <p className="text-ui-sm text-amber-600 dark:text-amber-400">{t('agents.manager_warning')}</p>
          )}
        </div>
      </Modal>

      {deactivateId && (
        <ConfirmDialog
          title={t('agents.deactivate')}
          description={t('agents.deactivate_confirm')}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateId(null)}
          confirmLabel={t('agents.deactivate')}
        />
      )}

      {revoke && (
        <ConfirmDialog
          title={t('agents.revoke_key')}
          description={t('agents.revoke_key_confirm')}
          onConfirm={handleRevoke}
          onCancel={() => setRevoke(null)}
          confirmLabel={t('agents.revoke_key')}
        />
      )}
    </div>
  )
}
