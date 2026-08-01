import { describe, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../test/render'
import { expectDvhRoot } from '../test/dvhRootRecipe'
import { RegisterPage } from './RegisterPage'

// T19 — dvh + safe-area sweep, AC1: no 100vh-based unit anywhere in src/.
// See dvhRootRecipe.ts for why this asserts a class token, not a measured
// height.
//
// RegisterPage has two render branches (form, then post-submit "check your
// email") that each carry their own root className — both need the fix.
// The submit branch requires a network call, so it is exercised through the
// real form flow with a mocked API boundary rather than a source-lint
// shortcut, matching how the rest of this suite mocks the HTTP layer.

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    authApi: { ...actual.authApi, register: vi.fn().mockResolvedValue(undefined) },
  }
})

describe('RegisterPage root container height unit (T19 AC1)', () => {
  it('uses the dvh-based height unit on the form branch', () => {
    const { container } = renderWithProviders(<RegisterPage />)
    const root = container.firstElementChild as HTMLElement

    expectDvhRoot(root)
  })

  it('uses the dvh-based height unit on the post-submit "check your email" branch', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<RegisterPage />)

    // RegisterPage's <label>s are not wired to their <input>s via
    // htmlFor/id (a pre-existing gap, out of scope for T19), so the fields
    // are reached by type/order rather than accessible name here.
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInputs = container.querySelectorAll('input[type="password"]')

    await user.type(nameInput, 'Ada Lovelace')
    await user.type(emailInput, 'ada@example.com')
    await user.type(passwordInputs[0], 'password123')
    await user.type(passwordInputs[1], 'password123')
    await user.click(screen.getByRole('button', { name: /register/i }))

    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement
      expectDvhRoot(root)
    })
  })
})
