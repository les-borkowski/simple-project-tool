import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocaleSwitcher } from '../components/config/LocaleSwitcher'
import { ThemeSwitcher } from '../components/config/ThemeSwitcher'
import { ApiKeyList } from '../components/config/ApiKeyList'

type Tab = 'profile' | 'api_keys' | 'security'

export function ConfigPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: t('config.profile') },
    { key: 'api_keys', label: t('config.api_keys') },
    { key: 'security', label: t('config.security') },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t('config.title')}</h1>

      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'profile' && (
        <div className="max-w-md space-y-6">
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
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Password change coming in v2.
          </p>
        </div>
      )}
    </div>
  )
}
