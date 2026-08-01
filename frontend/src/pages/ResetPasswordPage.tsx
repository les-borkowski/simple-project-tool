import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../services/api'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setStatus('loading')
    try {
      await authApi.confirmPasswordReset(token, password)
      setStatus('success')
    } catch {
      setStatus('error')
      setError(t('auth.reset_password_failed'))
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-7 h-7 rounded-md accent-bg flex items-center justify-center text-ui-sm font-semibold">SP</span>
          <span className="text-ui-xl font-semibold">Simple Project Tool</span>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8">
          {status === 'success' ? (
            <div className="text-center">
              <p className="text-ui-2xl font-semibold tracking-tight mb-2">{t('auth.reset_password')}</p>
              <p className="text-ui-md text-stone-500 mb-6">{t('auth.reset_password_success')}</p>
              <Link to="/login" className="inline-block py-2.5 px-6 rounded-md accent-bg text-ui-lg font-medium">
                {t('auth.login')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-ui-2xl font-semibold tracking-tight mb-1">{t('auth.reset_password')}</h2>
              <p className="text-ui-md text-stone-500 mb-6">{t('auth.reset_password_subtitle')}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">
                    {t('auth.new_password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
                  />
                </div>
                {error && <p className="text-ui-md text-rose-600 dark:text-rose-400">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full py-2.5 rounded-md accent-bg text-ui-lg font-medium disabled:opacity-50"
                >
                  {status === 'loading' ? t('auth.resetting') : t('auth.reset_password_submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
