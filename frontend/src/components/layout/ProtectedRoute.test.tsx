import { describe, it } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { expectDvhRoot } from '../../test/dvhRootRecipe'
import { ProtectedRoute } from './ProtectedRoute'

// T19 — dvh + safe-area sweep, AC1: no 100vh-based unit anywhere in src/.
// See dvhRootRecipe.ts for why this asserts a class token, not a measured
// height.
//
// ProtectedRoute's spinner only renders while AuthContext.isLoading is true,
// so the auth context is driven directly through renderWithProviders' `auth`
// override rather than mocking the network — no request is in flight during
// this state, only the initial session-restore check the app performs on
// every load.
describe('ProtectedRoute loading spinner container height unit (T19 AC1)', () => {
  it('uses the dvh-based height unit while the session is being restored', () => {
    const { container } = renderWithProviders(<ProtectedRoute />, {
      auth: { isLoading: true },
    })
    const root = container.firstElementChild as HTMLElement

    expectDvhRoot(root)
  })
})
