import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  authApi,
  configApi,
  setDemoMode,
  setTokenAccessor,
  setRefreshFn,
  setOnUnauthorized,
} from '../services/api'
import type { UserResponse } from '../services/api'
import i18n from '../i18n'
import { AuthContext } from './auth-context'

// Persists across tabs (localStorage) so a new tab after login still tries to restore
// the session from the httpOnly refresh cookie.  Cleared on explicit logout.
const SESSION_FLAG = 'spt_logged_in'

interface AuthState {
  user: UserResponse | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

function applyTheme(theme: string) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy initializer: isLoading only needs to start true when a restore
  // attempt is actually about to happen (SESSION_FLAG present). This is
  // knowable synchronously at first render, so there is no need to write it
  // from the mount effect below — the "no session" case never needs a
  // setState at all, which is what actually eliminates the
  // set-state-in-effect violation on that branch (rather than just hiding it
  // in a callback shape).
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: !!localStorage.getItem(SESSION_FLAG),
  }))

  // Keep a ref so interceptors always see the latest token without stale closure
  const accessTokenRef = useRef<string | null>(null)

  // Deduplicates concurrent refresh calls — all in-flight 401s share one promise
  const pendingRefreshRef = useRef<Promise<string | null> | null>(null)

  function setAccessToken(token: string | null) {
    accessTokenRef.current = token
    setState((s) => ({ ...s, accessToken: token }))
  }

  async function loadUserConfig(_token: string): Promise<UserResponse> {
    const me = await authApi.me()
    const user = me.data
    try {
      const cfg = await configApi.get()
      user.config = cfg.data
      i18n.changeLanguage(cfg.data.locale)
      applyTheme(cfg.data.theme)
    } catch {
      // config non-critical
    }
    return user
  }

  const refreshToken = (): Promise<string | null> => {
    if (pendingRefreshRef.current) return pendingRefreshRef.current
    pendingRefreshRef.current = (async () => {
      try {
        const res = await authApi.refresh()
        const newToken = res.data.access_token
        setAccessToken(newToken)
        return newToken
      } catch {
        setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
        return null
      }
    })().finally(() => { pendingRefreshRef.current = null })
    return pendingRefreshRef.current
  }

  // Wire up interceptor accessors once
  useEffect(() => {
    setTokenAccessor(() => accessTokenRef.current)
    setRefreshFn(refreshToken)
    setOnUnauthorized(() => {
      accessTokenRef.current = null
      setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
    })
  }, [])

  // Silent restore on mount — only attempt if the user was previously logged in.
  // Skipping when the flag is absent avoids a spurious 401 on every cold unauthenticated load.
  useEffect(() => {
    // isLoading already starts false in this case (see the lazy initializer
    // above), so there is nothing to write here — just skip the restore
    // attempt entirely.
    if (!localStorage.getItem(SESSION_FLAG)) return
    ;(async () => {
      try {
        const res = await authApi.refresh()
        const token = res.data.access_token
        accessTokenRef.current = token
        const user = await loadUserConfig(token)
        setDemoMode(user.is_demo ?? false)
        setState({ user, accessToken: token, isAuthenticated: true, isLoading: false })
      } catch {
        localStorage.removeItem(SESSION_FLAG)
        setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
      }
    })()
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    const { access_token } = res.data
    localStorage.setItem(SESSION_FLAG, '1')
    accessTokenRef.current = access_token
    const user = await loadUserConfig(access_token)
    setDemoMode(user.is_demo ?? false)
    setState({ user, accessToken: access_token, isAuthenticated: true, isLoading: false })
  }

  const logout = async () => {
    try { await authApi.logout() } catch { /* best effort */ }
    localStorage.removeItem(SESSION_FLAG)
    accessTokenRef.current = null
    setDemoMode(false)
    setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  )
}
