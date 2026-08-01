import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { expectCanonicalHeader, pageHeaderAround } from '../test/pageHeaderRecipe'
import { makeProject, makeProjectStatus, makeStory, makeTask, makeUser } from '../test/factories'
import { TaskDetailPage } from './TaskDetailPage'
import type { MemberResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T15a — TaskDetailPage adopts PageHeader, Breadcrumbs and DetailRail, the
// same migration T11 did for StoryDetailPage (see
// StoryDetailPage.detailRail.test.tsx, which this file mirrors).
//
// jsdom computes no layout: getBoundingClientRect() is all zeros, no Tailwind
// class resolves to a real box, and no media query resolves against a real
// viewport width (the matchMedia stub in src/test/setup.ts fakes width
// matching from a JS variable, which is exactly what the ticket says the real
// implementation must NOT branch layout on — CSS variants only). So:
//   - "visible above the description with no scrolling" is asserted as DOM
//     ORDER (AC1) plus the CLASS TOKENS the primitives are documented to key
//     their CSS variants from (AC4/AC6), never a measured position.
//   - "no horizontal scroll" and "the sticky header does not detach" are NOT
//     asserted here at all — jsdom cannot produce or refute either claim, and
//     a test that always passes regardless of the real layout would assert
//     nothing. They are left as an explicit browser-measurement gap; see this
//     file's header comment and the handoff report for T15a.
//   - The breadcrumb collapse (AC5) is asserted through the matchMedia stub's
//     `setViewportWidth`, which is the pattern DetailRail.test.tsx and
//     StoryDetailPage.detailRail.test.tsx already use for the one thing in
//     this codebase that legitimately reads the viewport in JS.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    tasksApi: { ...actual.tasksApi, get: vi.fn(), update: vi.fn() },
    storiesApi: { ...actual.storiesApi, get: vi.fn(), list: vi.fn() },
    projectsApi: { ...actual.projectsApi, get: vi.fn(), listMembers: vi.fn() },
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
    sprintsApi: { ...actual.sprintsApi, list: vi.fn() },
    commentsApi: { ...actual.commentsApi, listForTask: vi.fn() },
    timeTrackingApi: { ...actual.timeTrackingApi, historyForTask: vi.fn() },
  }
})

import {
  commentsApi,
  projectsApi,
  sprintsApi,
  statusesApi,
  storiesApi,
  tasksApi,
  timeTrackingApi,
} from '../services/api'

const PROJECT = makeProject({ id: 'proj-1', name: 'Apollo' })
const STORY = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
const STATUSES = [
  makeProjectStatus({ project_id: 'proj-1', slug: 'todo', name: 'To Do', order: 0 }),
  makeProjectStatus({ project_id: 'proj-1', slug: 'done', name: 'Done', order: 1 }),
]

/** A task under a story: the four-crumb path (Projects / Apollo / Login flow / task). */
const STORY_TASK = makeTask({
  id: 'task-1',
  project_id: 'proj-1',
  story_id: 'story-1',
  title: 'Fix login bug',
  status: 'todo',
  priority: 'medium',
})

/** A project-level task with no story: the three-crumb path. */
const PROJECT_TASK = makeTask({
  id: 'task-2',
  project_id: 'proj-1',
  story_id: null,
  title: 'Provision staging box',
  status: 'todo',
  priority: 'medium',
})

function pending() {
  return new Promise(() => {}) as never
}

function settled<T>(data: T) {
  return () => Promise.resolve({ data }) as never
}

function stubApi({ taskPending = false }: { taskPending?: boolean } = {}) {
  const manager = makeUser({ role: 'manager' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  const resolveWith = <T,>(data: T) => (taskPending ? pending : settled(data))

  vi.mocked(tasksApi.get).mockImplementation((id: string) =>
    resolveWith(id === 'task-2' ? PROJECT_TASK : STORY_TASK)()
  )
  vi.mocked(tasksApi.update).mockResolvedValue({ data: STORY_TASK } as never)
  vi.mocked(storiesApi.get).mockImplementation(resolveWith(STORY))
  vi.mocked(storiesApi.list).mockImplementation(resolveWith({ items: [], next_cursor: null }))
  vi.mocked(projectsApi.get).mockImplementation(resolveWith(PROJECT))
  vi.mocked(projectsApi.listMembers).mockImplementation(resolveWith([member]))
  vi.mocked(statusesApi.list).mockImplementation(resolveWith(STATUSES))
  vi.mocked(sprintsApi.list).mockImplementation(resolveWith([]))
  vi.mocked(commentsApi.listForTask).mockImplementation(
    resolveWith({ items: [], next_cursor: null })
  )
  vi.mocked(timeTrackingApi.historyForTask).mockImplementation(resolveWith([]))

  return manager
}

function mountStoryTaskPage(manager: ReturnType<typeof makeUser>) {
  return renderWithProviders(<TaskDetailPage />, {
    path: '/stories/:storyId/tasks/:taskId',
    route: '/stories/story-1/tasks/task-1',
    auth: { user: manager, isAuthenticated: true },
  })
}

function mountProjectTaskPage(manager: ReturnType<typeof makeUser>) {
  return renderWithProviders(<TaskDetailPage />, {
    path: '/projects/:projectId/tasks/:taskId',
    route: '/projects/proj-1/tasks/task-2',
    auth: { user: manager, isAuthenticated: true },
  })
}

async function renderStoryTaskPage(width = 1280) {
  setViewportWidth(width)
  const manager = stubApi()
  const view = mountStoryTaskPage(manager)
  await screen.findByRole('heading', { level: 1, name: 'Fix login bug' })
  return view
}

async function renderProjectTaskPage(width = 1280) {
  setViewportWidth(width)
  const manager = stubApi()
  const view = mountProjectTaskPage(manager)
  await screen.findByRole('heading', { level: 1, name: 'Provision staging box' })
  return view
}

function renderLoadingStoryTaskPage(width = 1280) {
  setViewportWidth(width)
  const manager = stubApi({ taskPending: true })
  return mountStoryTaskPage(manager)
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
    screen.getByRole('heading', { name: 'Description' })
  )
  return main
}

function tokensOf(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

describe('TaskDetailPage adopts PageHeader (AC2, AC6)', () => {
  it('renders exactly one level-1 heading', async () => {
    await renderStoryTaskPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('draws the header with the canonical PageHeader recipe', async () => {
    const { container } = await renderStoryTaskPage()

    const heading = screen.getByRole('heading', { level: 1, name: 'Fix login bug' })
    const header = expectCanonicalHeader(heading)
    expect(container).toContainElement(header)
  })

  it('does not change desktop header appearance at 1280px: the header still draws its bottom rule', async () => {
    await renderStoryTaskPage(1280)

    const heading = screen.getByRole('heading', { level: 1, name: 'Fix login bug' })
    const header = pageHeaderAround(heading)
    expect(tokensOf(header)).toEqual(
      expect.arrayContaining(['border-b', 'border-stone-200', 'bg-white'])
    )
  })

  it('still shows a level-1 heading while the task is loading', () => {
    renderLoadingStoryTaskPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('draws a pulsing placeholder in the header while loading, announcing no fake title', () => {
    renderLoadingStoryTaskPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1 }))
    const skeletons = header.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
    for (const skeleton of skeletons) {
      expect(skeleton.textContent).toBe('')
    }
  })
})

describe('TaskDetailPage breadcrumbs (AC5)', () => {
  it('renders the crumb trail as a navigation landmark built from Breadcrumbs', async () => {
    await renderStoryTaskPage()

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Login flow' })).toBeInTheDocument()
    expect(nav).toHaveTextContent('Fix login bug')
  })

  it('shows all four crumbs at 1280px, above the collapse threshold', async () => {
    await renderStoryTaskPage(1280)

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Login flow' })).toBeInTheDocument()
  })

  it('collapses the four-crumb trail at 375px, taking the hidden crumbs out of the DOM', async () => {
    await renderStoryTaskPage(375)

    const nav = screen.getByRole('navigation')
    // first / … / parent / current
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(
      within(nav).queryByRole('link', { name: 'Apollo' }),
      'the second crumb must be collapsed out of the DOM, not merely hidden'
    ).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Login flow' })).toBeInTheDocument()
    expect(nav).toHaveTextContent('Fix login bug')
    expect(within(nav).getByRole('button', { name: 'Show the full path' })).toBeInTheDocument()
  })

  it('expands the collapsed trail back to all four crumbs when the ellipsis is activated', async () => {
    const user = userEvent.setup()
    await renderStoryTaskPage(375)

    await user.click(screen.getByRole('button', { name: 'Show the full path' }))

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('links the story crumb at the story\'s own id, not the route param, when the route carries no storyId', async () => {
    // Regression test: the task is opened through the project-level route
    // (/projects/:projectId/tasks/:taskId, no :storyId param at all), yet its
    // data carries a story_id. The crumb must be built from the fetched
    // story's own id, never the (here: absent) route param, or it renders a
    // literal "undefined" in the href.
    const manager = stubApi()
    renderWithProviders(<TaskDetailPage />, {
      path: '/projects/:projectId/tasks/:taskId',
      route: '/projects/proj-1/tasks/task-1',
      auth: { user: manager, isAuthenticated: true },
    })
    await screen.findByRole('heading', { level: 1, name: 'Fix login bug' })

    const nav = screen.getByRole('navigation')
    const storyLink = within(nav).getByRole('link', { name: 'Login flow' })
    expect(storyLink.getAttribute('href')).toContain(STORY.id)
    expect(storyLink.getAttribute('href')).not.toContain('undefined')
  })

  it('does not collapse the three-crumb project-level-task path at 375px', async () => {
    await renderProjectTaskPage(375)

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(nav).toHaveTextContent('Provision staging box')
    expect(
      within(nav).queryByRole('button', { name: 'Show the full path' }),
      'a 3-crumb trail must never collapse'
    ).not.toBeInTheDocument()
  })
})

describe('TaskDetailPage rail (AC1, AC2)', () => {
  it('renders the rail as an <aside> landmark rather than a bare div', async () => {
    await renderStoryTaskPage()

    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('gives the rail landmark an accessible name from DetailRail', async () => {
    await renderStoryTaskPage()

    // DetailRail always sets aria-label from its `label` prop; a bare <aside>
    // with no aria-label has no accessible name at all.
    const rail = screen.getByRole('complementary')
    expect(rail).toHaveAccessibleName()
  })

  it('precedes the description and comments in the DOM, matching AC1’s mobile visual order', async () => {
    const { container } = await renderStoryTaskPage(375)

    const grid = gridOf(container)
    const rail = railOf(container)
    const main = mainColumnOf(container)
    const children = Array.from(grid.children)

    expect(
      children.indexOf(rail),
      'the rail must come before the main content column in the DOM'
    ).toBeLessThan(children.indexOf(main))
    expect(within(main).getByText(/Fix login bug|Description/)).toBeTruthy()
  })

  it('still shows the status control inside the rail', async () => {
    const { container } = await renderStoryTaskPage()

    const rail = railOf(container)
    // The status <select>'s options come from a separate statuses fetch
    // (useProjectStatuses), which can still be in flight after the task
    // heading itself has appeared — wait for it rather than racing it.
    await waitFor(() => {
      expect(
        within(rail)
          .getAllByRole('combobox')
          .some((el) => within(el).queryByRole('option', { name: 'To Do' }) !== null)
      ).toBe(true)
    })
  })
})

describe('TaskDetailPage column layout (AC4, AC6)', () => {
  it('lets the phone page scroll as one document instead of nesting a scroll region', async () => {
    const { container } = await renderStoryTaskPage(375)

    const tokens = tokensOf(mainColumnOf(container))
    expect(tokens, 'a nested scroller traps the phone reader').toContain('overflow-visible')
    expect(tokens, 'the desktop column still scrolls on its own').toContain('lg:overflow-y-auto')
    expect(tokens).not.toContain('overflow-y-auto')
  })

  it('keeps the 300px rail track and the min-h-0 grid', async () => {
    const { container } = await renderStoryTaskPage()

    const tokens = tokensOf(gridOf(container))
    expect(tokens).toContain('lg:grid-cols-[1fr_300px]')
    expect(tokens).toContain('min-h-0')
  })
})

describe('TaskDetailPage click-to-edit title', () => {
  it('replaces the heading with an editable input on click', async () => {
    const user = userEvent.setup()
    await renderStoryTaskPage()

    await user.click(screen.getByRole('heading', { level: 1, name: 'Fix login bug' }))

    expect(
      screen.queryByRole('heading', { level: 1, name: 'Fix login bug' }),
      'the heading must be replaced, not merely joined, by the input'
    ).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Fix login bug')).toBeInTheDocument()
  })

  it('saves the new title on Enter', async () => {
    const user = userEvent.setup()
    await renderStoryTaskPage()

    await user.click(screen.getByRole('heading', { level: 1, name: 'Fix login bug' }))
    const input = screen.getByDisplayValue('Fix login bug')
    await user.clear(input)
    await user.type(input, 'Fix the login bug for real')
    await user.keyboard('{Enter}')

    expect(tasksApi.update).toHaveBeenCalledWith('task-1', { title: 'Fix the login bug for real' })
  })

  it('reverts the draft and leaves edit mode on Escape without saving', async () => {
    const user = userEvent.setup()
    await renderStoryTaskPage()

    await user.click(screen.getByRole('heading', { level: 1, name: 'Fix login bug' }))
    const input = screen.getByDisplayValue('Fix login bug')
    await user.clear(input)
    await user.type(input, 'Something unsaved')
    await user.keyboard('{Escape}')

    expect(tasksApi.update).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { level: 1, name: 'Fix login bug' })).toBeInTheDocument()
  })
})
