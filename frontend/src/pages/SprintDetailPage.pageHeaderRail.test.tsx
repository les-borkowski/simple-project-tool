import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { expectCanonicalHeader, pageHeaderAround } from '../test/pageHeaderRecipe'
import { makeProject, makeUser } from '../test/factories'
import { SprintDetailPage } from './SprintDetailPage'
import type { MemberResponse, SprintResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T15b — SprintDetailPage adopts PageHeader, Breadcrumbs and DetailRail, the
// near-mechanical repeat of T15a (see TaskDetailPage.pageHeaderRail.test.tsx,
// which this file mirrors) on the sibling page.
//
// jsdom computes no layout: getBoundingClientRect() is all zeros, no Tailwind
// class resolves to a real box, and no media query resolves against a real
// viewport width (the matchMedia stub in src/test/setup.ts fakes width
// matching from a JS variable — exactly what the ticket says the real
// implementation must NOT branch layout on). So:
//   - "visible above the task list with no scrolling" is asserted as DOM
//     ORDER plus the CLASS TOKENS the primitives are documented to key their
//     CSS variants from, never a measured position.
//   - "exactly one scroll container on mobile" and "the sticky header does
//     not detach" are NOT asserted here at all — jsdom cannot produce or
//     refute either claim, and a test that always passes regardless of the
//     real layout would assert nothing. Left as an explicit browser-
//     measurement gap; see the report handed back with this file.
//   - The 3-crumb non-collapse is asserted through the matchMedia stub's
//     `setViewportWidth`, the pattern DetailRail.test.tsx and
//     StoryDetailPage.detailRail.test.tsx already use for the one thing in
//     this codebase that legitimately reads the viewport in JS.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    sprintsApi: { ...actual.sprintsApi, get: vi.fn(), update: vi.fn() },
    tasksApi: { ...actual.tasksApi, listForProject: vi.fn() },
    projectsApi: { ...actual.projectsApi, get: vi.fn(), listMembers: vi.fn() },
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
  }
})

import { projectsApi, sprintsApi, statusesApi, tasksApi } from '../services/api'

const PROJECT = makeProject({ id: 'proj-1', name: 'Apollo' })

function makeSprint(overrides: Partial<SprintResponse> = {}): SprintResponse {
  return {
    id: 'sprint-1',
    project_id: 'proj-1',
    name: 'Sprint 12',
    start_date: '2026-01-01',
    end_date: '2026-01-14',
    capacity: 40,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    total_effort: 12,
    task_count: 0,
    ...overrides,
  }
}

const SPRINT = makeSprint()

function pending() {
  return new Promise(() => {}) as never
}

function settled<T>(data: T) {
  return () => Promise.resolve({ data }) as never
}

function stubApi(
  { sprintPending = false, sprintError = false, role = 'manager' as 'manager' | 'contributor' } = {}
) {
  const user = makeUser({ role })
  const member: MemberResponse = {
    user_id: user.id,
    role,
    joined_at: new Date().toISOString(),
    name: user.name,
    email: user.email,
  }

  vi.mocked(sprintsApi.get).mockImplementation(() => {
    if (sprintError) return Promise.reject(new Error('boom'))
    if (sprintPending) return pending()
    return Promise.resolve({ data: SPRINT }) as never
  })
  vi.mocked(sprintsApi.update).mockResolvedValue({ data: SPRINT } as never)
  vi.mocked(tasksApi.listForProject).mockImplementation(
    settled({ items: [], next_cursor: null })
  )
  vi.mocked(projectsApi.get).mockImplementation(settled(PROJECT))
  vi.mocked(projectsApi.listMembers).mockImplementation(settled([member]))
  vi.mocked(statusesApi.list).mockImplementation(settled([]))

  return user
}

function mountPage(user: ReturnType<typeof makeUser>) {
  return renderWithProviders(<SprintDetailPage />, {
    path: '/projects/:projectId/sprints/:sprintId',
    route: '/projects/proj-1/sprints/sprint-1',
    auth: { user, isAuthenticated: true },
  })
}

async function renderSprintPage(
  width = 1280,
  opts: { role?: 'manager' | 'contributor' } = {}
) {
  setViewportWidth(width)
  const user = stubApi(opts)
  const view = mountPage(user)
  await screen.findByRole('heading', { level: 1, name: SPRINT.name })
  return { ...view, user }
}

function renderLoadingSprintPage(width = 1280) {
  setViewportWidth(width)
  const user = stubApi({ sprintPending: true })
  return mountPage(user)
}

function railOf(container: HTMLElement): HTMLElement {
  const rail = container.querySelector('aside')
  expect(rail, 'the detail rail should still render as an <aside>').not.toBeNull()
  return rail as HTMLElement
}

function gridOf(container: HTMLElement): HTMLElement {
  return railOf(container).parentElement as HTMLElement
}

function mainColumnOf(container: HTMLElement): HTMLElement {
  const rail = railOf(container)
  const main = Array.from(gridOf(container).children).find((el) => el !== rail) as HTMLElement
  expect(main, 'the two-column grid should still hold a main content column').toBeTruthy()
  expect(main, 'located the wrong column').toContainElement(
    screen.getByRole('heading', { level: 2, name: /Tasks/ })
  )
  return main
}

function tokensOf(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

describe('SprintDetailPage adopts PageHeader', () => {
  it('renders exactly one level-1 heading', async () => {
    await renderSprintPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('draws the header with the canonical PageHeader recipe', async () => {
    const { container } = await renderSprintPage()

    const heading = screen.getByRole('heading', { level: 1, name: SPRINT.name })
    const header = expectCanonicalHeader(heading)
    expect(container).toContainElement(header)
  })

  it('does not change desktop header appearance at 1280px: the header still draws its bottom rule', async () => {
    await renderSprintPage(1280)

    const heading = screen.getByRole('heading', { level: 1, name: SPRINT.name })
    const header = pageHeaderAround(heading)
    expect(tokensOf(header)).toEqual(
      expect.arrayContaining(['border-b', 'border-stone-200', 'bg-white'])
    )
  })

  it('carries the sprint date range as the header subtitle', async () => {
    await renderSprintPage()

    expect(screen.getByText(`${SPRINT.start_date} – ${SPRINT.end_date}`)).toBeInTheDocument()
  })

  it('still shows a level-1 heading while the sprint is loading', () => {
    renderLoadingSprintPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('draws a pulsing placeholder in the header while loading, announcing no fake title', () => {
    renderLoadingSprintPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1 }))
    const skeletons = header.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
    for (const skeleton of skeletons) {
      expect(skeleton.textContent).toBe('')
    }
  })

  it('still shows the error message, unbroken, when the sprint fails to load', async () => {
    setViewportWidth(1280)
    const user = stubApi({ sprintError: true })
    mountPage(user)

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
  })
})

describe('SprintDetailPage breadcrumbs', () => {
  it('renders the crumb trail as a navigation landmark built from Breadcrumbs', async () => {
    await renderSprintPage()

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(nav).toHaveTextContent(SPRINT.name)
  })

  it('links the project crumb at the sprints tab, not the plain project route', async () => {
    await renderSprintPage()

    const nav = screen.getByRole('navigation')
    const projectLink = within(nav).getByRole('link', { name: 'Apollo' })
    expect(projectLink.getAttribute('href')).toBe('/projects/proj-1?tab=sprints')
  })

  it('does not collapse the three-crumb trail at 375px, below the collapse threshold', async () => {
    await renderSprintPage(375)

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(nav).toHaveTextContent(SPRINT.name)
    expect(
      within(nav).queryByRole('button', { name: 'Show the full path' }),
      'a 3-crumb trail must never collapse'
    ).not.toBeInTheDocument()
  })
})

describe('SprintDetailPage rail', () => {
  it('renders the rail as an <aside> landmark rather than a bare div', async () => {
    await renderSprintPage()

    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('gives the rail landmark an accessible name from DetailRail', async () => {
    await renderSprintPage()

    // DetailRail always sets aria-label from its `label` prop; the page's
    // current hand-rolled <aside> carries no aria-label at all.
    const rail = screen.getByRole('complementary')
    expect(rail).toHaveAccessibleName()
  })

  it('precedes the task list in the DOM, matching the mobile visual order', async () => {
    const { container } = await renderSprintPage(375)

    const grid = gridOf(container)
    const rail = railOf(container)
    const main = mainColumnOf(container)
    const children = Array.from(grid.children)

    expect(
      children.indexOf(rail),
      'the rail must come before the main content column in the DOM'
    ).toBeLessThan(children.indexOf(main))
  })

  it('still renders all six detail fields in the rail', async () => {
    const { container } = await renderSprintPage()

    const rail = railOf(container)
    expect(within(rail).getByText('Start date')).toBeInTheDocument()
    expect(within(rail).getByText('End date')).toBeInTheDocument()
    expect(within(rail).getByText('Capacity')).toBeInTheDocument()
    expect(within(rail).getByText('Effort')).toBeInTheDocument()
    expect(within(rail).getByText('Project')).toBeInTheDocument()
    expect(within(rail).getByText('Created')).toBeInTheDocument()
  })
})

describe('SprintDetailPage column layout', () => {
  it('lets the phone page scroll as one document instead of nesting a scroll region', async () => {
    const { container } = await renderSprintPage(375)

    const tokens = tokensOf(mainColumnOf(container))
    expect(tokens, 'a nested scroller traps the phone reader').toContain('overflow-visible')
    expect(tokens, 'the desktop column still scrolls on its own').toContain('lg:overflow-y-auto')
    expect(tokens).not.toContain('overflow-y-auto')
  })

  it('widens the rail track to 300px and keeps the min-h-0 grid', async () => {
    const { container } = await renderSprintPage()

    const tokens = tokensOf(gridOf(container))
    expect(tokens).toContain('lg:grid-cols-[1fr_300px]')
    expect(tokens, 'the retired 280px track must be gone').not.toContain('lg:grid-cols-[1fr_280px]')
    expect(tokens).toContain('min-h-0')
  })
})

describe('SprintDetailPage click-to-edit title — manager', () => {
  it('replaces the heading with an editable input on click', async () => {
    const user = userEvent.setup()
    await renderSprintPage(1280, { role: 'manager' })
    // Wait for the manager role to resolve — DetailField renders an <input>
    // for the start date only once useRole's membership fetch has settled.
    await waitFor(() => {
      expect(screen.getByDisplayValue(SPRINT.start_date)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('heading', { level: 1, name: SPRINT.name }))

    expect(
      screen.queryByRole('heading', { level: 1, name: SPRINT.name }),
      'the heading must be replaced, not merely joined, by the input'
    ).not.toBeInTheDocument()
    expect(screen.getByDisplayValue(SPRINT.name)).toBeInTheDocument()
  })

  it('saves the new name on Enter', async () => {
    const user = userEvent.setup()
    await renderSprintPage(1280, { role: 'manager' })
    await waitFor(() => {
      expect(screen.getByDisplayValue(SPRINT.start_date)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('heading', { level: 1, name: SPRINT.name }))
    const input = screen.getByDisplayValue(SPRINT.name)
    await user.clear(input)
    await user.type(input, 'Sprint 12 (renamed)')
    await user.keyboard('{Enter}')

    expect(sprintsApi.update).toHaveBeenCalledWith('sprint-1', { name: 'Sprint 12 (renamed)' })
  })

  it('reverts the draft and leaves edit mode on Escape without saving', async () => {
    const user = userEvent.setup()
    await renderSprintPage(1280, { role: 'manager' })
    await waitFor(() => {
      expect(screen.getByDisplayValue(SPRINT.start_date)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('heading', { level: 1, name: SPRINT.name }))
    const input = screen.getByDisplayValue(SPRINT.name)
    await user.clear(input)
    await user.type(input, 'Something unsaved')
    await user.keyboard('{Escape}')

    expect(sprintsApi.update).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { level: 1, name: SPRINT.name })
    ).toBeInTheDocument()
  })
})

describe('SprintDetailPage click-to-edit title — contributor', () => {
  it('exposes no edit affordance: clicking the heading does not open an input', async () => {
    const user = userEvent.setup()
    await renderSprintPage(1280, { role: 'contributor' })
    // Wait for the contributor role to resolve — DetailField renders the
    // start date as plain text (not an <input>) only for a contributor, and
    // only once useRole's membership fetch has settled.
    await waitFor(() => {
      expect(screen.getByText(SPRINT.start_date)).toBeInTheDocument()
      expect(screen.queryByDisplayValue(SPRINT.start_date)).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('heading', { level: 1, name: SPRINT.name }))

    expect(
      screen.queryByDisplayValue(SPRINT.name),
      'a contributor must not be able to open the title editor'
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: SPRINT.name }),
      'the heading must remain a plain heading, not be swapped for an input'
    ).toBeInTheDocument()
    expect(sprintsApi.update).not.toHaveBeenCalled()
  })

  it('gives the manager heading the click-to-edit affordance classes, but not the contributor heading', async () => {
    // PageHeader only appends these classes when `onTitleClick` is truthy
    // (see src/components/layout/PageHeader.tsx). Gating `titleEditor` on
    // `isManager` while leaving `onTitleClick` ungated would still pass every
    // other test in this file: the heading would just invite a click that
    // opens nothing. Assert both roles here so the pair is a discriminator —
    // the manager assertion is what makes the contributor assertion meaningful.
    const affordanceClasses = ['cursor-text', 'hover:text-stone-600', 'dark:hover:text-stone-300']

    const contributorRender = await renderSprintPage(1280, { role: 'contributor' })
    const contributorHeading = screen.getByRole('heading', { level: 1, name: SPRINT.name })
    for (const cls of affordanceClasses) {
      expect(
        contributorHeading.classList.contains(cls),
        `a contributor's heading must not carry the "${cls}" click-to-edit affordance`
      ).toBe(false)
    }
    contributorRender.unmount()

    const { unmount } = await renderSprintPage(1280, { role: 'manager' })
    const managerHeading = screen.getByRole('heading', { level: 1, name: SPRINT.name })
    for (const cls of affordanceClasses) {
      expect(
        managerHeading.classList.contains(cls),
        `a manager's heading must carry the "${cls}" click-to-edit affordance`
      ).toBe(true)
    }
    unmount()
  })
})
