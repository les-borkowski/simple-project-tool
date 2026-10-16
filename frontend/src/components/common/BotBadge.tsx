import { useTranslation } from 'react-i18next'

export function BotBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-ui-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
      {t('agents.badge')}
    </span>
  )
}
