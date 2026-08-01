import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../test/render'
import { makeProject, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse } from '../services/api'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      get: vi.fn(),
      listMembers: vi.fn(),
      archive: vi.fn().mockResolvedValue({ data: {} }),
      restore: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    storiesApi: {
      ...actual.storiesApi,
      list: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null } }),
    },
    tasksApi: {
      ...actual.tasksApi,
      list: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null } }),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      // Page code swallows failures here and falls back to defaults, so a
      // rejection keeps this test focused on the menu without needing to
      // fabricate a full preferences payload.
      get: vi.fn().mockRejectedValue(new Error('not needed for this test')),
    },
  }
})

import { projectsApi } from '../services/api'

async function setupProjectDetailPage() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1',
    auth: { user: manager, isAuthenticated: true },
  })

  // Wait for the project to load past the loading skeleton.
  await screen.findByRole('heading', { name: project.name })

  return { manager, project }
}

describe('ProjectDetailPage overflow menu', () => {
  it('exposes aria-expanded on the overflow trigger', async () => {
    await setupProjectDetailPage()

    const trigger = await screen.findByRole('button', { name: /more actions/i })
    expect(trigger).toHaveAttribute('aria-haspopup')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('makes Archive and Delete reachable via a click alone, with no hover', async () => {
    const user = userEvent.setup()
    await setupProjectDetailPage()

    const trigger = await screen.findByRole('button', { name: /more actions/i })

    // Deliberately never call user.hover anywhere in this test: on a touch
    // device there is no hover, so a click must be sufficient on its own.
    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('archives the project when Archive is clicked through the menu', async () => {
    const user = userEvent.setup()
    await setupProjectDetailPage()

    const trigger = await screen.findByRole('button', { name: /more actions/i })
    await user.click(trigger)

    const archiveButton = await screen.findByRole('button', { name: 'Archive' })
    await user.click(archiveButton)

    expect(projectsApi.archive).toHaveBeenCalledWith('proj-1')
  })
})
