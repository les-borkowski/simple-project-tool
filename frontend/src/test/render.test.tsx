import { describe, expect, it } from 'vitest'
import { useAuth } from '../context/AuthContext'
import { renderWithProviders, screen } from './render'

function AuthConsumer() {
  const { isAuthenticated, user } = useAuth()
  return <div>{isAuthenticated ? `logged in as ${user?.name}` : 'logged out'}</div>
}

describe('renderWithProviders', () => {
  it('mounts a working AuthContext.Provider even when auth is omitted', () => {
    renderWithProviders(<AuthConsumer />)

    expect(screen.getByText('logged out')).toBeInTheDocument()
  })
})
