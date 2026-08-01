import { describe, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { expectTapSafeControl } from '../test/tapSafeRecipe'
import { makeProject, makeUser } from '../test/factories'
import { ProjectsPage } from './ProjectsPage'

// ---------------------------------------------------------------------------
// T21 AC1 — ProjectsPage per-card Edit/Delete row actions (16.5x19.3 and
// 16.5x32.9 measured — the smallest controls in the whole sweep).
//
// jsdom computes no layout (css: false), so this is a class-token assertion,
// never a measured height/width. Both are native <button>s
// (display:inline-block by UA default), so neither is at risk of the
// inline-display trap expectTapSafeControl guards for <a> elements.
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

async function renderProjectsPage() {
  vi.mocked(projectsApi.list).mockResolvedValue({
    data: { items: [makeProject({ id: 'proj-1', name: 'Alpha' })], next_cursor: null },
  } as never)

  renderWithProviders(<ProjectsPage />, {
    auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
  })

  await screen.findByText('Alpha')
}

describe('ProjectsPage card actions tap-target pass (T21 AC1)', () => {
  it('makes the per-card Edit and Delete actions tap-safe', async () => {
    await renderProjectsPage()

    expectTapSafeControl(screen.getByRole('button', { name: 'Edit' }), 'the project card "Edit" action')
    expectTapSafeControl(screen.getByRole('button', { name: 'Delete' }), 'the project card "Delete" action')
  })
})

// ---------------------------------------------------------------------------
// T21 review fix 2 — the header "Create project" button was skipped by the
// original sweep. Its className is byte-identical to two buttons in
// ProjectDetailPage.tsx (the header "New" trigger and the story-form submit)
// that both received tap-safe; this is the only primary create action on
// /projects and must get the same treatment.
// ---------------------------------------------------------------------------
describe('ProjectsPage header CTA tap-target pass (T21 review fix 2)', () => {
  it('makes the "Create project" button tap-safe', async () => {
    await renderProjectsPage()

    expectTapSafeControl(
      screen.getByRole('button', { name: 'New project' }),
      'the header "Create project" CTA'
    )
  })
})
