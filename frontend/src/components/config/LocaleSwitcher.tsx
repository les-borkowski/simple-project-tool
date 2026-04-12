import { useTranslation } from 'react-i18next'
import { configApi } from '../../services/api'
import type { Locale } from '../../services/api'
import i18n from '../../i18n'

const locales: { value: Locale; label: string }[] = [
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'pl', label: 'Polski' },
]

export function LocaleSwitcher() {
  const { i18n: i18nHook } = useTranslation()

  const handleChange = async (locale: Locale) => {
    await configApi.update({ locale })
    i18n.changeLanguage(locale)
  }

  return (
    <div className="flex gap-2">
      {locales.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className={`px-4 py-2 text-sm rounded-md border transition-colors ${
            i18nHook.language === value
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
