import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../test/render'
import { expectDvhRoot } from '../test/dvhRootRecipe'
import { ForgotPasswordPage } from './ForgotPasswordPage'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      requestPasswordReset: vi.fn(),
    },
  }
})

import { authApi } from '../services/api'

// T19 — dvh + safe-area sweep, AC1: no 100vh-based unit anywhere in src/.
// See dvhRootRecipe.ts for why this asserts a class token, not a measured
// height.
//
// ForgotPasswordPage makes no network call on mount (only on submit), so a
// real render is cheap.
describe('ForgotPasswordPage root container height unit (T19 AC1)', () => {
  it('uses the dvh-based height unit, not the 100vh-based one', () => {
    const { container } = renderWithProviders(<ForgotPasswordPage />, {
      route: '/auth/forgot-password',
    })
    const root = container.firstElementChild as HTMLElement

    expectDvhRoot(root)
  })
})

describe('ForgotPasswordPage', () => {
  it('sends the request for the typed address and confirms', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({ data: { message: 'ok' } } as never)

    renderWithProviders(<ForgotPasswordPage />, { route: '/auth/forgot-password' })

    await user.type(screen.getByRole('textbox'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('someone@example.com')
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  // The backend answers "if that email is registered…" precisely so an
  // unauthenticated caller cannot enumerate accounts. The UI has to keep that
  // promise: the confirmation must not claim an email *was* sent to a real
  // account, or the wording itself leaks what the status code does not.
  it('confirms without revealing whether the account exists', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({ data: { message: 'ok' } } as never)

    renderWithProviders(<ForgotPasswordPage />, { route: '/auth/forgot-password' })

    await user.type(screen.getByRole('textbox'), 'ghost@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/if that email address is registered/i)).toBeInTheDocument()
  })

  it('surfaces an error when the request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.requestPasswordReset).mockRejectedValue(new Error('network down'))

    renderWithProviders(<ForgotPasswordPage />, { route: '/auth/forgot-password' })

    await user.type(screen.getByRole('textbox'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })

  it('offers a way back to the login page', () => {
    renderWithProviders(<ForgotPasswordPage />, { route: '/auth/forgot-password' })

    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login')
  })
})
