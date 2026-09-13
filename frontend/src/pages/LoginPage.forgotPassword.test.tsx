import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { LoginPage } from './LoginPage'

// A user who cannot sign in has no other route to a reset: the reset page only
// consumes a token that arrives by email, and nothing else in the app requests
// one. The link below is that entry point, so it is asserted rather than left
// to survive on layout alone.
describe('LoginPage forgot-password entry point', () => {
  it('links to the forgot-password page', () => {
    renderWithProviders(<LoginPage />)

    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/auth/forgot-password'
    )
  })
})
