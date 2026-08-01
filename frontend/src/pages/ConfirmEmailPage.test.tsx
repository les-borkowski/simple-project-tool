import { describe, it } from 'vitest'
import { renderWithProviders } from '../test/render'
import { expectDvhRoot } from '../test/dvhRootRecipe'
import { ConfirmEmailPage } from './ConfirmEmailPage'

// T19 — dvh + safe-area sweep, AC1: no 100vh-based unit anywhere in src/.
// See dvhRootRecipe.ts for why this asserts a class token, not a measured
// height.
//
// With no ?token= in the URL the page renders straight into its 'error'
// branch and never calls authApi.confirmEmail, so no network mock is needed
// for a cheap render.
describe('ConfirmEmailPage root container height unit (T19 AC1)', () => {
  it('uses the dvh-based height unit, not the 100vh-based one', () => {
    const { container } = renderWithProviders(<ConfirmEmailPage />, { route: '/confirm-email' })
    const root = container.firstElementChild as HTMLElement

    expectDvhRoot(root)
  })
})
