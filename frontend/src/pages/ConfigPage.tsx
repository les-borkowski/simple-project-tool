import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, type AccentColor } from '../context/ThemeContext'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'
import { projectsApi, authApi } from '../services/api'
import type { ProjectResponse } from '../services/api'
import { ProjectStatusManager } from '../components/config/ProjectStatusManager'
import { useRole } from '../hooks/useRole'
import { useToast } from '../context/ToastContext'
import { initials as getInitials } from '../utils/initials'
import { getApiErrorCode } from '../utils/errors'

const ACCENT_COLORS: Record<AccentColor, string> = {
  indigo: '#6366f1',
  violet: '#8b5cf6',
  emerald: '#059669',
  rose: '#e11d48',
  amber: '#d97706',
  stone: '#44403c',
}

type Tab = 'profile' | 'api_keys' | 'security'
type TopTab = 'app' | 'project'

const IKey = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="8" cy="15" r="4"/><path d="m11 12 9-9-3-3-2 2 1 1-2 2-1-1-2 2 1 1-1 1 1 1z"/>
  </svg>
)
const IUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
  </svg>
)
const IShield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M12 2L3 7v5c0 5 3.9 9.7 9 11 5.1-1.3 9-6 9-11V7z"/>
  </svg>
)

export function ConfigPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { accent, setAccent } = useTheme()
  const [tab, setTab] = useState<Tab>('profile')
  const [topTab, setTopTab] = useState<TopTab>('app')
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const { isManager } = useRole(selectedProjectId || undefined)
  const [effortEnabled, setEffortEnabled] = useState(false)
  const [effortUnit, setEffortUnit] = useState('sp')
  const [savingEffort, setSavingEffort] = useState(false)
  const { addToast } = useToast()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState<{ field: 'current' | 'confirm'; message: string } | null>(null)
  const [pwChanged, setPwChanged] = useState(false)

  useEffect(() => {
    if (topTab === 'project') {
      projectsApi.list({ limit: 100 }).then((r) => setProjects(r.data.items))
    }
  }, [topTab])

  useEffect(() => {
    if (!selectedProjectId) return
    setEffortEnabled(false)
    setEffortUnit('sp')
    projectsApi.get(selectedProjectId)
      .then((r) => {
        const unit = r.data.effort_unit
        setEffortEnabled(!!unit)
        setEffortUnit(unit ?? 'sp')
      })
      .catch(() => {
        // keep default state on error
      })
  }, [selectedProjectId])

  const handleSaveEffortUnit = async () => {
    if (!selectedProjectId) return
    setSavingEffort(true)
    try {
      await projectsApi.update(selectedProjectId, {
        effort_unit: effortEnabled ? (effortUnit.trim() || 'sp') : null,
      })
    } catch {
      addToast('Failed to save effort settings', 'error')
    } finally {
      setSavingEffort(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    if (newPw !== confirmPw) {
      setPwError({ field: 'confirm', message: t('errors.password_mismatch') })
      return
    }
    setPwLoading(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwChanged(true)
    } catch (err: unknown) {
      const code = getApiErrorCode(err)
      if (code === 'Current password is incorrect') {
        setPwError({ field: 'current', message: t('config.current_password_incorrect') })
      } else {
        addToast(t('errors.generic'), 'error')
      }
    } finally {
      setPwLoading(false)
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { key: 'profile', label: t('config.profile'), icon: <IUser /> },
    { key: 'api_keys', label: t('config.api_keys'), icon: <IKey />, disabled: true },
    { key: 'security', label: t('config.security'), icon: <IShield /> },
  ]

  const initials = user ? getInitials(user.name) : '?'

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-6 pb-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <h1 className="text-[22px] font-semibold tracking-tight mb-3">{t('config.title')}</h1>
        <div className="flex gap-1">
          {(['app', 'project'] as const).map((tt) => (
            <button
              key={tt}
              onClick={() => setTopTab(tt)}
              className={`px-3 py-1.5 text-[12.5px] rounded-md transition-colors ${
                topTab === tt
                  ? 'bg-stone-100 dark:bg-stone-900 font-medium text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {tt === 'app' ? t('config.app_settings') : t('config.project_settings')}
            </button>
          ))}
        </div>
      </div>

      {topTab === 'app' && (
        <div className="flex-1 grid grid-cols-[200px_1fr]">
          <nav className="border-r border-stone-200 dark:border-stone-800 px-3 py-4 space-y-0.5 bg-white dark:bg-stone-950">
            {tabs.map(({ key, label, icon, disabled }) => (
              <button
                key={key}
                onClick={() => {
                  if (!disabled) {
                    setTab(key)
                    setPwChanged(false)
                  }
                }}
                disabled={disabled}
                className={`w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  disabled
                    ? 'text-stone-400 dark:text-stone-600 cursor-not-allowed'
                    : tab === key
                      ? 'bg-stone-100 dark:bg-stone-900 font-medium text-stone-900 dark:text-stone-100'
                      : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100/60 dark:hover:bg-stone-900/60'
                }`}
              >
                <span className={disabled ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'}>{icon}</span>
                {label}
              </button>
            ))}
          </nav>

          <div className="px-8 py-6 max-w-2xl space-y-6">
            {tab === 'profile' && (
              <>
                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
                  <div className="flex items-center gap-4">
                    <span className="w-14 h-14 rounded-full av-2 inline-flex items-center justify-center text-white text-[14px] font-semibold shrink-0">
                      {initials}
                    </span>
                    <div>
                      <div className="text-[15px] font-medium">{user?.name}</div>
                      <div className="text-[12.5px] text-stone-500">{user?.email} · <span className="capitalize">{user?.role}</span></div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-5">
                  <h3 className="text-[14px] font-medium">{t('config.appearance')}</h3>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.theme')}</label>
                    <ThemeSwitcher />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-stone-400 font-medium">{t('config.accent_colour')}</label>
                    <div className="flex gap-2 mt-2">
                      {(['indigo','violet','emerald','rose','amber','stone'] as const).map(a => (
                        <button
                          key={a}
                          title={a}
                          onClick={() => setAccent(a)}
                          style={{ background: ACCENT_COLORS[a] }}
                          className={`w-6 h-6 rounded-full transition-all ${accent === a ? 'ring-2 ring-offset-2 ring-current' : 'opacity-70 hover:opacity-100'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.locale')}</label>
                    <LocaleSwitcher />
                  </div>
                </section>
              </>
            )}

            {tab === 'api_keys' && (
              <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800">
                  <h3 className="text-[14px] font-medium">{t('config.api_keys')}</h3>
                  <p className="text-[12px] text-stone-500 mt-0.5">{t('config.api_keys_desc')}</p>
                </div>
                <div className="p-5">
                  <ApiKeyList />
                </div>
              </section>
            )}

            {tab === 'security' && (
              <>
                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
                  <h3 className="text-[14px] font-medium mb-4">{t('config.change_password')}</h3>
                  <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                    <div>
                      <label htmlFor="current-password" className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.current_password')}
                      </label>
                      <input
                        id="current-password"
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                      {pwError?.field === 'current' && (
                        <p className="mt-1 text-[12px] text-red-500">{pwError.message}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="new-password" className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.new_password')}
                      </label>
                      <input
                        id="new-password"
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        autoComplete="new-password"
                        required
                        className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.confirm_new_password')}
                      </label>
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        autoComplete="new-password"
                        required
                        className="w-full px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                      {pwError?.field === 'confirm' && (
                        <p className="mt-1 text-[12px] text-red-500">{pwError.message}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="px-4 py-1.5 text-[12px] rounded-md accent-bg text-white disabled:opacity-50"
                    >
                      {pwLoading ? t('common.saving') : t('config.update_password')}
                    </button>
                  </form>
                </section>

                {pwChanged && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
                      <h3 className="text-[16px] font-semibold text-stone-900 dark:text-stone-100 mb-2">
                        {t('config.password_changed_title')}
                      </h3>
                      <p className="text-[13px] text-stone-500 dark:text-stone-300 mb-5">
                        {t('config.password_changed_body')}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setPwChanged(false)}
                          className="flex-1 px-4 py-2 text-[13px] rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
                        >
                          {t('config.stay_logged_in')}
                        </button>
                        <button
                          onClick={() => { logout(); navigate('/login') }}
                          className="flex-1 px-4 py-2 text-[13px] rounded-md accent-bg text-white"
                        >
                          {t('auth.logout')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {topTab === 'project' && (
        <div className="flex-1 px-8 py-6 max-w-2xl space-y-6">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2">
              {t('config.select_project')}
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-64"
            >
              <option value="">— {t('config.select_project')} —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {selectedProjectId && (
            <>
              <ProjectStatusManager projectId={selectedProjectId} isManager={isManager} />
              <div className="mt-6 pt-6 border-t border-stone-200 dark:border-stone-800">
                <h3 className="text-[12px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
                  {t('effort.unit_label')}
                </h3>
                <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={effortEnabled}
                    onChange={(e) => setEffortEnabled(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-[13px]">{t('effort.enable')}</span>
                </label>
                {effortEnabled && (
                  <div className="flex gap-2 items-center">
                    <input
                      className="px-2.5 py-1.5 text-[13px] rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-32"
                      value={effortUnit}
                      onChange={(e) => setEffortUnit(e.target.value)}
                      placeholder="sp"
                      maxLength={20}
                    />
                    <button
                      className="px-3 py-1.5 text-[12px] rounded-md accent-bg text-white transition-colors disabled:opacity-50"
                      onClick={handleSaveEffortUnit}
                      disabled={savingEffort}
                    >
                      {savingEffort ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                )}
                {!effortEnabled && (
                  <button
                    className="px-3 py-1.5 text-[12px] rounded-md border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50"
                    onClick={handleSaveEffortUnit}
                    disabled={savingEffort}
                  >
                    {savingEffort ? t('common.saving') : t('common.save')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
