import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { makeProject, makeUser } from '../test/factories'
import { ProjectsPage } from './ProjectsPage'

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

async function renderProjectsPage() {
  vi.mocked(projectsApi.list).mockResolvedValue({
    data: { items: [makeProject({ id: 'proj-1', name: 'Alpha' })], next_cursor: null },
  } as never)

  renderWithProviders(<ProjectsPage />, {
    auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
  })

  await screen.findByText('Alpha')
}

// jsdom does not compute CSS from Tailwind classes, so there is no way to ask
// "is this actually visible" the way a browser would. The honest thing a
// jsdom test can do is assert on the className string itself: whether the
// opacity-hiding utility classes are present, and whether they are gated
// behind the `md:` breakpoint (so mobile is never hover-only).
describe('ProjectsPage card actions', () => {
  it('keeps per-card actions visible (not hidden via opacity-0) on a narrow/touch viewport', async () => {
    setViewportWidth(375)
    await renderProjectsPage()

    const editButton = screen.getByRole('button', { name: 'Edit' })
    const deleteButton = screen.getByRole('button', { name: 'Delete' })

    const actionsContainer = editButton.parentElement as HTMLElement
    expect(actionsContainer).toContainElement(deleteButton)
    expect(actionsContainer.className).not.toMatch(/(?<!md:)opacity-0(?!\S)/)
  })

  it('still gates actions behind hover on desktop widths via md: classes', async () => {
    setViewportWidth(1280)
    await renderProjectsPage()

    const editButton = screen.getByRole('button', { name: 'Edit' })
    const actionsContainer = editButton.parentElement as HTMLElement

    expect(actionsContainer.className).toMatch(/md:opacity-0/)
    expect(actionsContainer.className).toMatch(/md:group-hover:opacity-100/)
  })
})
