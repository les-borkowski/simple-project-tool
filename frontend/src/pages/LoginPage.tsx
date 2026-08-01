import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../services/api'
import { getApiErrorMessage } from '../utils/errors'

export function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const rawNext = (location.state as { next?: string })?.next
  const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/projects'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailNotConfirmed(false)
    setResendSent(false)
    setLoading(true)
    try {
      await login(email, password)
      navigate(next, { replace: true })
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err)
      if (msg === 'EMAIL_NOT_CONFIRMED') {
        setEmailNotConfirmed(true)
      } else {
        setError(msg ?? t('errors.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendLoading(true)
    try {
      await authApi.resendConfirmation(email)
      setResendSent(true)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Left — form */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <span className="w-7 h-7 rounded-md accent-bg flex items-center justify-center text-ui-sm font-semibold">SP</span>
            <span className="text-ui-xl font-semibold">Simple Project Tool</span>
          </div>

          <h1 className="text-ui-4xl font-semibold tracking-tight mb-1">{t('auth.welcome_back')}</h1>
          <p className="text-ui-md text-stone-500 mb-7">{t('auth.sign_in_subtitle')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-lg focus-ring"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-ui-xs uppercase tracking-wider text-stone-400 font-medium">{t('auth.password')}</label>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-lg focus-ring"
              />
            </div>
            {error && <p className="text-ui-md text-rose-600 dark:text-rose-400">{error}</p>}
            {emailNotConfirmed && (
              <div className="text-ui-md text-amber-600 dark:text-amber-400 space-y-1">
                <p>{t('auth.email_not_confirmed')}</p>
                {resendSent ? (
                  <p className="text-emerald-600 dark:text-emerald-400">{t('auth.resend_email_sent')}</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading}
                    className="accent-text hover:underline disabled:opacity-50"
                  >
                    {t('auth.resend_email')}
                  </button>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md accent-bg text-ui-lg font-medium disabled:opacity-50"
            >
              {loading ? t('auth.logging_in') : t('auth.login')}
            </button>
          </form>

          <p className="mt-6 text-ui-md text-stone-500">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="accent-text hover:underline">{t('auth.register')}</Link>
          </p>
        </div>
      </div>

      {/* Right — atmospheric panel */}
      <div className="hidden lg:flex relative items-center justify-center overflow-hidden bg-stone-50 dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800">
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(70% 50% at 70% 30%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative max-w-sm w-full mx-auto px-8">
          <div className="rounded-2xl bg-white dark:bg-stone-950 shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="ml-3 text-ui-xs text-stone-400">Projects · Board</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { code: 'ORB-101', title: 'Welcome screen illustration variants', status: 'st-rev', priority: 2 },
                { code: 'ORB-102', title: 'Permissions rationale copy', status: 'st-prog', priority: 3 },
                { code: 'ORB-103', title: 'First-project empty state', status: 'st-todo', priority: 2 },
                { code: 'ORB-110', title: 'APNs cert rotation runbook', status: 'st-done', priority: 2 },
              ].map((t) => (
                <div key={t.code} className="rounded-md border border-stone-200 dark:border-stone-800 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-ui-2xs text-stone-400">{t.code}</span>
                    <span className="pr-bars" data-level={t.priority}><span /><span /><span /></span>
                  </div>
                  <div className="text-ui-sm mt-1 text-stone-700 dark:text-stone-300">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`st-pill ${t.status}`}><span className="dot" />{t.status.replace('st-', '').replace('rev','In review').replace('prog','In progress').replace('todo','To do').replace('done','Done').replace('test','In testing')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-center text-ui-md text-stone-500 italic">"Finally a tracker that gets out of the way."</p>
        </div>
      </div>
    </div>
  )
}
