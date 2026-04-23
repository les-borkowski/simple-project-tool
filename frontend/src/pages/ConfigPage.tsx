import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useTheme, type AccentColor } from '../context/ThemeContext'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'
import { projectsApi } from '../services/api'
import type { ProjectResponse } from '../services/api'
import { ProjectStatusManager } from '../components/config/ProjectStatusManager'
import { useRole } from '../hooks/useRole'

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
  const { user } = useAuth()
  const { accent, setAccent, density, setDensity } = useTheme()
  const [tab, setTab] = useState<Tab>('profile')
  const [topTab, setTopTab] = useState<TopTab>('app')
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const { isManager } = useRole(selectedProjectId || undefined)

  useEffect(() => {
    if (topTab === 'project') {
      projectsApi.list({ limit: 100 }).then((r) => setProjects(r.data.items))
    }
  }, [topTab])

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t('config.profile'), icon: <IUser /> },
    { key: 'api_keys', label: t('config.api_keys'), icon: <IKey /> },
    { key: 'security', label: t('config.security'), icon: <IShield /> },
  ]

  const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

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
            {tabs.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  tab === key
                    ? 'bg-stone-100 dark:bg-stone-900 font-medium text-stone-900 dark:text-stone-100'
                    : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100/60 dark:hover:bg-stone-900/60'
                }`}
              >
                <span className="text-stone-400">{icon}</span>
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
                    <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.density')}</label>
                    <div className="flex gap-2">
                      {(['compact','balanced','spacious'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => setDensity(d)}
                          className={`px-3 py-1.5 text-[12px] rounded-md border transition-colors capitalize ${
                            density === d
                              ? 'accent-bg border-transparent text-white'
                              : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                          }`}
                        >
                          {d}
                        </button>
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
              <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
                <h3 className="text-[14px] font-medium mb-2">{t('config.security')}</h3>
                <p className="text-[13px] text-stone-500">{t('config.security_placeholder')}</p>
              </section>
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
            <ProjectStatusManager projectId={selectedProjectId} isManager={isManager} />
          )}
        </div>
      )}
    </div>
  )
}
