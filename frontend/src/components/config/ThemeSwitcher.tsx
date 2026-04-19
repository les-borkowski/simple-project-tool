import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { configApi } from '../../services/api'
import type { Theme } from '../../services/api'
import { applyTheme } from '../../utils/theme'

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState<Theme>(() => {
    const root = document.documentElement
    if (root.classList.contains('dark')) return 'dark'
    return 'light'
  })

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: t('config.theme_light') },
    { value: 'dark', label: t('config.theme_dark') },
    { value: 'system', label: t('config.theme_system') },
  ]

  const handleChange = async (theme: Theme) => {
    setCurrent(theme)
    applyTheme(theme)
    await configApi.update({ theme })
  }

  return (
    <div className="flex gap-2">
      {themes.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className={`px-4 py-2 text-sm rounded-md border transition-colors ${
            current === value
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
