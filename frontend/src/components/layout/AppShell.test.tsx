import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { makeUser } from '../../test/factories'
import { AppShell } from './AppShell'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    projectsApi: { ...actual.projectsApi, list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
    invitationsApi: { ...actual.invitationsApi, mine: vi.fn().mockResolvedValue({ data: [] }) },
    recentApi: { ...actual.recentApi, list: vi.fn().mockResolvedValue({ data: [] }) },
  }
})

describe('AppShell', () => {
  it('renders the sidebar workspace link when authenticated, without hitting the network', async () => {
    renderWithProviders(
      <AppShell>
        <div>content</div>
      </AppShell>,
      { auth: { user: makeUser(), isAuthenticated: true } }
    )

    expect(await screen.findByText('Simple Project Tool')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Invitations' })).toBeInTheDocument()
  })
})
