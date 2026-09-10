import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { makeProject, makeUser } from '../test/factories'
import { ProjectsPage } from './ProjectsPage'

// ---------------------------------------------------------------------------
// CommandPalette navigates here with `state={{ modal: 'create-project' }}`
// (the only producer) to deep-link straight into the create-project modal.
// ProjectsPage is the only consumer, and nothing previously asserted the
// link between them. Regression coverage for the render-time
// (not effect-time) handling of that router state, added alongside the
// set-state-in-effect fix in ProjectsPage.tsx.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      list: vi.fn(),
    },
  }
})

import { projectsApi } from '../services/api'

describe('ProjectsPage deep-linked create modal', () => {
  it('opens the create-project modal on first render when navigated with modal: create-project state', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue({
      data: { items: [makeProject({ id: 'proj-1', name: 'Alpha' })], next_cursor: null },
    } as never)

    renderWithProviders(<ProjectsPage />, {
      auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
      route: { pathname: '/projects', state: { modal: 'create-project' } },
    })

    expect(await screen.findByRole('dialog')).toBeVisible()
  })
})
