import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../services/api'

export function ConfirmEmailPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
    token ? 'loading' : 'error'
  )

  useEffect(() => {
    if (!token) return
    authApi.confirmEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="min-h-dvh flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-7 h-7 rounded-md accent-bg flex items-center justify-center text-ui-sm font-semibold">SP</span>
          <span className="text-ui-xl font-semibold">Simple Project Tool</span>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
          {status === 'loading' && (
            <p className="text-ui-lg text-stone-500">{t('auth.confirming_email')}</p>
          )}
          {status === 'success' && (
            <>
              <p className="text-ui-2xl font-semibold tracking-tight mb-2">{t('auth.email_confirmed')}</p>
              <p className="text-ui-md text-stone-500 mb-6">{t('auth.email_confirmed_subtitle')}</p>
              <Link
                to="/login"
                className="inline-block py-2.5 px-6 rounded-md accent-bg text-ui-lg font-medium"
              >
                {t('auth.login')}
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <p className="text-ui-2xl font-semibold tracking-tight mb-2">{t('auth.confirm_email_failed')}</p>
              <p className="text-ui-md text-stone-500">{t('auth.confirm_email_failed_subtitle')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
