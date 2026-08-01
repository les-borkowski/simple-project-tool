import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { makeProjectStatus, makeUser } from '../../test/factories'
import { ProjectStatusManager } from './ProjectStatusManager'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn(),
    },
  }
})

import { statusesApi } from '../../services/api'

// jsdom does not compute CSS from Tailwind classes, so the honest assertion
// here is on the className string itself: the delete control must not be
// hover-only on touch (no bare opacity-0), and must still be gated behind
// hover on desktop via the md: breakpoint.
describe('ProjectStatusManager row actions', () => {
  it('keeps the delete control reachable on touch while still hover-gated on desktop', async () => {
    vi.mocked(statusesApi.list).mockResolvedValue({
      data: [makeProjectStatus({ id: 'status-1', name: 'To do' })],
    } as never)

    renderWithProviders(
      <ProjectStatusManager projectId="proj-1" isManager={true} />,
      { auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true } }
    )

    const deleteButton = await screen.findByRole('button', { name: 'Delete' })

    expect(deleteButton.className).not.toMatch(/(?<!md:)opacity-0(?!\S)/)
    expect(deleteButton.className).toMatch(/md:opacity-0/)
    expect(deleteButton.className).toMatch(/md:group-hover:opacity-100/)
  })
})
