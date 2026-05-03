import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100">404</h1>
      <p className="text-stone-500 dark:text-stone-300">{t('errors.not_found')}</p>
      <Link to="/projects" className="accent-text hover:underline">
        {t('errors.back_home')}
      </Link>
    </div>
  )
}
