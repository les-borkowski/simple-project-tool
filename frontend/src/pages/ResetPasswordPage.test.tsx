import { describe, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { expectDvhRoot } from '../test/dvhRootRecipe'
import { ResetPasswordPage } from './ResetPasswordPage'

// T19 — dvh + safe-area sweep, AC1: no 100vh-based unit anywhere in src/.
// See dvhRootRecipe.ts for why this asserts a class token, not a measured
// height.
//
// ResetPasswordPage makes no network call on mount (only on submit), so a
// real render is cheap.
describe('ResetPasswordPage root container height unit (T19 AC1)', () => {
  it('uses the dvh-based height unit, not the 100vh-based one', () => {
    const { container } = renderWithProviders(<ResetPasswordPage />, { route: '/reset-password' })
    const root = container.firstElementChild as HTMLElement

    expectDvhRoot(root)
  })
})
