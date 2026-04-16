import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'

type Tab = 'profile' | 'api_keys' | 'security'

export function ConfigPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: t('config.profile') },
    { key: 'api_keys', label: t('config.api_keys') },
    { key: 'security', label: t('config.security') },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('config.title')}</h1>

      <div className="border-b border-gray-200 dark:border-gray-600 mb-6">
        <nav className="flex gap-6">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-sky-600 text-sky-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'profile' && (
        <div className="max-w-md space-y-6">
          {user && (
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-sky-700 dark:text-sky-300 font-semibold text-sm">
                  {user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-300">{user.email}</p>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('config.locale')}
            </label>
            <LocaleSwitcher />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('config.theme')}
            </label>
            <ThemeSwitcher />
          </div>
        </div>
      )}

      {tab === 'api_keys' && <ApiKeyList />}

      {tab === 'security' && (
        <div className="max-w-md">
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Password change coming in v2.
          </p>
        </div>
      )}
    </div>
  )
}
