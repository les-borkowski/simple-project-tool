import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme, type AccentColor } from '../context/ThemeContext'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'
import { projectsApi, authApi, isDemoBlockedError } from '../services/api'
import type { ProjectResponse } from '../services/api'
import { ProjectStatusManager } from '../components/config/ProjectStatusManager'
import { Modal } from '../components/common/Modal'
import { Tabs } from '../components/common/Tabs'
import { tabId } from '../utils/tabId'
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

// Each scope's body is the panel of the tablist above it, so both ids are
// needed up front to wire aria-controls / aria-labelledby.
const APP_PANEL_ID = 'config-app-panel'
const PROJECT_PANEL_ID = 'config-project-panel'

// Tab ids get their own namespace per tablist: the scope tabs point at whichever
// panel is showing, so deriving their ids from the panel id would collide with
// the section tabs' the moment the two key sets overlapped.
const SCOPE_TABS_ID = 'config-scope'
const SECTION_TABS_ID = 'config-sections'

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
    } catch (e) {
      if (isDemoBlockedError(e)) return
      addToast(t('effort.save_failed'), 'error')
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
      if (isDemoBlockedError(err)) return
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

  // Memoised because Tabs re-scrolls its active tab into view whenever `items`
  // changes, and a fresh array on every keystroke in the password form would
  // count as a change.
  const scopeTabs = useMemo(
    () => [
      { key: 'app', label: t('config.app_settings') },
      { key: 'project', label: t('config.project_settings') },
    ],
    [t]
  )

  const tabs = useMemo(
    () => [
      { key: 'profile', label: t('config.profile'), icon: <IUser /> },
      { key: 'api_keys', label: t('config.api_keys'), icon: <IKey />, disabled: true },
      { key: 'security', label: t('config.security'), icon: <IShield /> },
    ],
    [t]
  )

  const initials = user ? getInitials(user.name) : '?'

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-7 pt-6 pb-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <h1 className="text-ui-3xl font-semibold tracking-tight mb-3">{t('config.title')}</h1>
        <Tabs
          items={scopeTabs}
          value={topTab}
          onChange={(key) => setTopTab(key as TopTab)}
          label={t('config.settings_scope')}
          panelId={topTab === 'app' ? APP_PANEL_ID : PROJECT_PANEL_ID}
          idPrefix={SCOPE_TABS_ID}
        />
      </div>

      {topTab === 'app' && (
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[200px_1fr]">
          <Tabs
            items={tabs}
            value={tab}
            onChange={(key) => {
              setTab(key as Tab)
              setPwChanged(false)
            }}
            label={t('config.settings_sections')}
            orientation="vertical-lg"
            panelId={APP_PANEL_ID}
            idPrefix={SECTION_TABS_ID}
            className="border-b lg:border-b-0 lg:border-r border-stone-200 dark:border-stone-800 px-3 py-2 lg:py-4 bg-white dark:bg-stone-950"
          />

          <div
            id={APP_PANEL_ID}
            role="tabpanel"
            aria-labelledby={tabId(SECTION_TABS_ID, tab)}
            // flex-1 fills the height the grid used to give the body below lg;
            // it is inert on a grid item, so the desktop column is unchanged.
            className="flex-1 px-4 py-5 md:px-8 md:py-6 max-w-2xl space-y-6"
          >
            {tab === 'profile' && (
              <>
                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
                  <div className="flex items-center gap-4">
                    <span className="w-14 h-14 rounded-full av-2 inline-flex items-center justify-center text-white text-ui-lg font-semibold shrink-0">
                      {initials}
                    </span>
                    <div>
                      <div className="text-ui-xl font-medium">{user?.name}</div>
                      <div className="text-ui-md text-stone-500">{user?.email} · <span className="capitalize">{user?.role}</span></div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-5">
                  <h3 className="text-ui-lg font-medium">{t('config.appearance')}</h3>
                  <div>
                    <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.theme')}</label>
                    <ThemeSwitcher />
                  </div>
                  <div>
                    <label className="text-ui-xs uppercase tracking-wider text-stone-400 font-medium">{t('config.accent_colour')}</label>
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
                    <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.locale')}</label>
                    <LocaleSwitcher />
                  </div>
                </section>
              </>
            )}

            {tab === 'api_keys' && (
              <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800">
                  <h3 className="text-ui-lg font-medium">{t('config.api_keys')}</h3>
                  <p className="text-ui-sm text-stone-500 mt-0.5">{t('config.api_keys_desc')}</p>
                </div>
                <div className="p-5">
                  <ApiKeyList />
                </div>
              </section>
            )}

            {tab === 'security' && (
              <>
                <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
                  <h3 className="text-ui-lg font-medium mb-4">{t('config.change_password')}</h3>
                  <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
                    <div>
                      <label htmlFor="current-password" className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.current_password')}
                      </label>
                      <input
                        id="current-password"
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        autoComplete="current-password"
                        required
                        className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                      {pwError?.field === 'current' && (
                        <p className="mt-1 text-ui-sm text-red-500">{pwError.message}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="new-password" className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.new_password')}
                      </label>
                      <input
                        id="new-password"
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        autoComplete="new-password"
                        required
                        className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1.5">
                        {t('config.confirm_new_password')}
                      </label>
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        autoComplete="new-password"
                        required
                        className="w-full px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900"
                      />
                      {pwError?.field === 'confirm' && (
                        <p className="mt-1 text-ui-sm text-red-500">{pwError.message}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="px-4 py-1.5 text-ui-sm rounded-md accent-bg text-white disabled:opacity-50"
                    >
                      {pwLoading ? t('common.saving') : t('config.update_password')}
                    </button>
                  </form>
                </section>

                <Modal
                  open={pwChanged}
                  onClose={() => setPwChanged(false)}
                  title={t('config.password_changed_title')}
                  size="sm"
                  footer={
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setPwChanged(false)}
                        className="flex-1 px-4 py-2 text-ui-md rounded-md border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 tap-safe"
                      >
                        {t('config.stay_logged_in')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { logout(); navigate('/login') }}
                        className="flex-1 px-4 py-2 text-ui-md rounded-md accent-bg text-white tap-safe"
                      >
                        {t('auth.logout')}
                      </button>
                    </div>
                  }
                >
                  <p className="text-ui-md text-stone-500 dark:text-stone-300">
                    {t('config.password_changed_body')}
                  </p>
                </Modal>
              </>
            )}
          </div>
        </div>
      )}

      {topTab === 'project' && (
        <div
          id={PROJECT_PANEL_ID}
          role="tabpanel"
          aria-labelledby={tabId(SCOPE_TABS_ID, 'project')}
          className="flex-1 px-4 py-5 md:px-8 md:py-6 max-w-2xl space-y-6"
        >
          <div>
            <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-2">
              {t('config.select_project')}
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-64"
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
                <h3 className="text-ui-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
                  {t('effort.unit_label')}
                </h3>
                <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={effortEnabled}
                    onChange={(e) => setEffortEnabled(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="text-ui-md">{t('effort.enable')}</span>
                </label>
                {effortEnabled && (
                  <div className="flex gap-2 items-center">
                    <input
                      className="px-2.5 py-1.5 text-ui-md rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 w-32"
                      value={effortUnit}
                      onChange={(e) => setEffortUnit(e.target.value)}
                      placeholder="sp"
                      maxLength={20}
                    />
                    <button
                      className="px-3 py-1.5 text-ui-sm rounded-md accent-bg text-white transition-colors disabled:opacity-50"
                      onClick={handleSaveEffortUnit}
                      disabled={savingEffort}
                    >
                      {savingEffort ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                )}
                {!effortEnabled && (
                  <button
                    className="px-3 py-1.5 text-ui-sm rounded-md border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50"
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
