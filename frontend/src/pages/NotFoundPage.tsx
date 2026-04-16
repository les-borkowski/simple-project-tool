import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">404</h1>
      <p className="text-gray-500 dark:text-gray-300">{t('errors.not_found')}</p>
      <Link to="/projects" className="text-sky-600 hover:underline">
        {t('errors.back_home')}
      </Link>
    </div>
  )
}
