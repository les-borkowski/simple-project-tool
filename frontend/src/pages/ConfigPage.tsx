import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'

type Tab = 'profile' | 'api_keys' | 'security'

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
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t('config.profile'), icon: <IUser /> },
    { key: 'api_keys', label: t('config.api_keys'), icon: <IKey /> },
    { key: 'security', label: t('config.security'), icon: <IShield /> },
  ]

  const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-7 pt-6 pb-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <h1 className="text-[22px] font-semibold tracking-tight">{t('config.title')}</h1>
      </div>

      {/* Two-column */}
      <div className="flex-1 grid grid-cols-[200px_1fr]">
        {/* Left nav */}
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

        {/* Content */}
        <div className="px-8 py-6 max-w-2xl space-y-6">
          {tab === 'profile' && (
            <>
              {/* Profile card */}
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

              {/* Appearance */}
              <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 space-y-5">
                <h3 className="text-[14px] font-medium">Appearance</h3>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2">{t('config.theme')}</label>
                  <ThemeSwitcher />
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
                <h3 className="text-[14px] font-medium">API keys</h3>
                <p className="text-[12px] text-stone-500 mt-0.5">Use keys to access the SPT API from scripts and integrations. Keep them secret.</p>
              </div>
              <div className="p-5">
                <ApiKeyList />
              </div>
            </section>
          )}

          {tab === 'security' && (
            <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5">
              <h3 className="text-[14px] font-medium mb-2">{t('config.security')}</h3>
              <p className="text-[13px] text-stone-500">Password change coming in v2.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
