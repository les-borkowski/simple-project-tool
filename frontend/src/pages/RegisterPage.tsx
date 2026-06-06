import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../services/api'
import { getApiErrorMessage } from '../utils/errors'

export function RegisterPage() {
  const { t } = useTranslation()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError(t('errors.password_mismatch'))
      return
    }
    setLoading(true)
    try {
      await authApi.register(email, name, password)
      setRegisteredEmail(email)
      setRegistered(true)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) ?? t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <span className="w-7 h-7 rounded-md accent-bg flex items-center justify-center text-[12px] font-semibold">SP</span>
            <span className="text-[15px] font-semibold">Simple Project Tool</span>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8 text-center">
            <p className="text-[20px] font-semibold tracking-tight mb-2">{t('auth.check_email_title')}</p>
            <p className="text-[13px] text-stone-500">{t('auth.check_email_subtitle', { email: registeredEmail })}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <span className="w-7 h-7 rounded-md accent-bg flex items-center justify-center text-[12px] font-semibold">SP</span>
          <span className="text-[15px] font-semibold">Simple Project Tool</span>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 p-8">
          <h2 className="text-[20px] font-semibold tracking-tight mb-1">{t('auth.register')}</h2>
          <p className="text-[12.5px] text-stone-500 mb-6">{t('auth.register_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">{t('auth.name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-1">{t('auth.confirm_password')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-[13px] focus-ring"
              />
            </div>
            {error && <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md accent-bg text-[13.5px] font-medium disabled:opacity-50"
            >
              {loading ? t('auth.registering') : t('auth.register')}
            </button>
          </form>

          <p className="mt-5 text-[12.5px] text-stone-500">
            {t('auth.have_account')}{' '}
            <Link to="/login" className="accent-text hover:underline">{t('auth.login')}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
