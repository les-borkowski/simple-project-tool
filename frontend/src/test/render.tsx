import type { ReactElement, ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import type { RenderOptions, RenderResult } from '@testing-library/react'
import i18n from '../i18n'
import { ThemeProvider } from '../context/ThemeContext'
import { ToastProvider } from '../context/ToastContext'
import { AuthContext } from '../context/AuthContext'
import type { useAuth } from '../context/AuthContext'

type AuthContextValue = ReturnType<typeof useAuth>

const defaultAuth: AuthContextValue = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  refreshToken: async () => null,
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  path?: string
  auth?: Partial<AuthContextValue>
}

function Providers({
  children,
  route,
  path,
  auth,
}: {
  children: ReactNode
  route?: string
  path?: string
  auth?: Partial<AuthContextValue>
}) {
  const content =
    path !== undefined ? (
      <Routes>
        <Route path={path} element={children} />
      </Routes>
    ) : (
      children
    )

  const withAuth = (
    <AuthContext.Provider value={{ ...defaultAuth, ...auth }}>{content}</AuthContext.Provider>
  )

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route ?? '/']}>{withAuth}</MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </I18nextProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  { route, path, auth, ...renderOptions }: RenderWithProvidersOptions = {}
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers route={route} path={path} auth={auth}>
        {children}
      </Providers>
    ),
    ...renderOptions,
  })
}

export * from '@testing-library/react'
