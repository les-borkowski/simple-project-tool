import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { makeProject, makeProjectStatus, makeStory, makeUser } from '../test/factories'
import enGB from '../locales/en-GB.json'
import pl from '../locales/pl.json'
import { StoryDetailPage } from './StoryDetailPage'
import type { MemberResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T11 — StoryDetailPage adopts DetailRail, PageHeader and Breadcrumbs.
//
// Co-located next to the page and named for the ticket's centrepiece, matching
// the ProjectDetailPage.menu / ProjectDetailPage.statusMenu convention already
// in src/pages/.
//
// "The page uses <DetailRail>" is a component boundary — an internal no user can
// see — so it is never asserted directly. Everything below is asserted through
// its user-visible consequence: what the rail's <aside> renders, what is on
// screen at 375px without scrolling or tapping, and what happens when the reader
// changes the status from it.
//
// jsdom computes no layout (getBoundingClientRect() is all zeros, Tailwind is
// never resolved), so "sits above the main content", "two across", "scrolls as
// one document" and the 300px track are exact class-token assertions read off
// classList — flagged as structurally-only covered in the T11 report.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    storiesApi: { ...actual.storiesApi, get: vi.fn(), update: vi.fn() },
    projectsApi: { ...actual.projectsApi, get: vi.fn(), listMembers: vi.fn() },
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
    tasksApi: { ...actual.tasksApi, list: vi.fn() },
    commentsApi: { ...actual.commentsApi, listForStory: vi.fn() },
    timeTrackingApi: { ...actual.timeTrackingApi, historyForStory: vi.fn() },
  }
})

import {
  commentsApi,
  projectsApi,
  statusesApi,
  storiesApi,
  tasksApi,
  timeTrackingApi,
} from '../services/api'

// The canonical T09 header recipe, and the four combos it retired — the page's
// own `px-7 pt-5 pb-4` among them.
const CANONICAL_PADDING = ['px-4', 'pt-4', 'pb-3', 'md:px-7', 'md:pt-5', 'md:pb-3']
const DRIFTED_PADDING = ['px-7', 'pt-6', 'pb-4', 'pt-5']

// The <aside> as it renders today at StoryDetailPage.tsx:366, minus `border-l`
// (which becomes `lg:border-l`). AC1: at 1280px the rail must still be this.
const TODAYS_ASIDE_TOKENS = [
  'border-stone-200',
  'dark:border-stone-800',
  'bg-stone-50/40',
  'dark:bg-stone-950/30',
  'px-5',
  'py-5',
  'space-y-5',
  'text-ui-md',
]

const STORY = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
const PROJECT = makeProject({ id: 'proj-1', name: 'Apollo' })
const STATUSES = [
  makeProjectStatus({ project_id: 'proj-1', slug: 'todo', name: 'To Do', order: 0 }),
  makeProjectStatus({ project_id: 'proj-1', slug: 'done', name: 'Done', order: 1 }),
]

function stubApi({ storyPending = false }: { storyPending?: boolean } = {}) {
  const manager = makeUser({ role: 'manager' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  // While the page is loading, EVERY request is left in flight — otherwise a
  // late-resolving members or statuses call lands state on an unmounted-looking
  // tree and React's act warning turns into noise the real failure hides behind.
  const pending = () => new Promise(() => {}) as never
  const settled = <T,>(data: T) => () => Promise.resolve({ data }) as never

  const resolveWith = <T,>(data: T) => (storyPending ? pending : settled(data))

  vi.mocked(storiesApi.get).mockImplementation(resolveWith(STORY))
  vi.mocked(storiesApi.update).mockResolvedValue({ data: STORY } as never)
  vi.mocked(projectsApi.get).mockImplementation(resolveWith(PROJECT))
  vi.mocked(projectsApi.listMembers).mockImplementation(resolveWith([member]))
  vi.mocked(statusesApi.list).mockImplementation(resolveWith(STATUSES))
  vi.mocked(tasksApi.list).mockImplementation(resolveWith({ items: [], next_cursor: null }))
  vi.mocked(commentsApi.listForStory).mockImplementation(
    resolveWith({ items: [], next_cursor: null })
  )
  vi.mocked(timeTrackingApi.historyForStory).mockImplementation(resolveWith([]))

  return manager
}

function mountPage(manager: ReturnType<typeof makeUser>) {
  return renderWithProviders(<StoryDetailPage />, {
    path: '/projects/:projectId/stories/:storyId',
    route: '/projects/proj-1/stories/story-1',
    auth: { user: manager, isAuthenticated: true },
  })
}

async function renderStoryPage(width = 1280) {
  setViewportWidth(width)
  const manager = stubApi()
  const view = mountPage(manager)
  await screen.findByRole('heading', { level: 1, name: 'Login flow' })
  return view
}

/** Renders the page with the story request still in flight. */
function renderLoadingStoryPage(width = 1280) {
  setViewportWidth(width)
  const manager = stubApi({ storyPending: true })
  return mountPage(manager)
}

function railOf(container: HTMLElement): HTMLElement {
  const rail = container.querySelector('aside')
  expect(rail, 'the detail rail should still render as an <aside>').not.toBeNull()
  return rail as HTMLElement
}

function gridOf(container: HTMLElement): HTMLElement {
  return railOf(container).parentElement as HTMLElement
}

/** The scrolling content column: the grid child that is not the rail. */
function mainColumnOf(container: HTMLElement): HTMLElement {
  const rail = railOf(container)
  const main = Array.from(gridOf(container).children).find((el) => el !== rail) as HTMLElement
  expect(main, 'the two-column grid should still hold a main content column').toBeTruthy()
  expect(main, 'located the wrong column').toContainElement(
    screen.getByRole('heading', { name: 'Description' })
  )
  return main
}

/** The page header block: the nearest ancestor of the <h1> drawing the bottom rule. */
function pageHeaderAround(heading: HTMLElement): HTMLElement {
  const root = heading.closest('.border-b')
  expect(root, 'the page header should still draw its bottom rule').not.toBeNull()
  return root as HTMLElement
}

function tokensOf(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

/**
 * A rail control identified by an option it offers, so the tests do not depend
 * on DOM order and do not presuppose the accessible-name fix asserted
 * separately below.
 */
function railControlOffering(rail: HTMLElement, optionLabel: string): HTMLElement {
  const control = within(rail)
    .getAllByRole('combobox')
    .find((el) => within(el).queryByRole('option', { name: optionLabel }) !== null)
  expect(control, `no rail control offers a "${optionLabel}" option`).toBeTruthy()
  return control as HTMLElement
}

describe('StoryDetailPage header (AC5)', () => {
  it('renders the story title in a header carrying the canonical PageHeader recipe', async () => {
    const { container } = await renderStoryPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1, name: 'Login flow' }))
    expect(container).toContainElement(header)
    expect(tokensOf(header)).toEqual(expect.arrayContaining(CANONICAL_PADDING))
  })

  it('sheds the retired px-7 pt-5 pb-4 padding the page uses today', async () => {
    await renderStoryPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1, name: 'Login flow' }))
    for (const drifted of DRIFTED_PADDING) {
      expect(tokensOf(header), `header still carries the retired "${drifted}"`).not.toContain(
        drifted
      )
    }
  })

  it('sticks the header below the mobile top bar', async () => {
    await renderStoryPage(375)

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1, name: 'Login flow' }))
    const tokens = tokensOf(header)
    expect(tokens).toContain('sticky')
    expect(tokens).toContain('top-topbar')
    expect(tokens).toContain('lg:top-0')
  })

  it('renders the crumb trail as a navigation landmark', async () => {
    await renderStoryPage()

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('leaves the current story as plain text rather than a link', async () => {
    await renderStoryPage()

    const nav = screen.getByRole('navigation')
    expect(nav).toHaveTextContent('Login flow')
    expect(within(nav).queryByRole('link', { name: 'Login flow' })).not.toBeInTheDocument()
  })

  it('points the project crumb back at the stories tab', async () => {
    await renderStoryPage()

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toHaveAttribute(
      'href',
      '/projects/proj-1?tab=stories'
    )
  })

  it('shows all three crumbs at 375px, being below the collapse threshold', async () => {
    await renderStoryPage(375)

    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(nav).toHaveTextContent('Login flow')
    expect(
      within(nav).queryByRole('button', { name: 'Show the full path' }),
      'a 3-crumb trail must never collapse'
    ).not.toBeInTheDocument()
  })
})

describe('StoryDetailPage loading branch (AC5)', () => {
  it('still shows a level-1 heading while the story is loading', () => {
    renderLoadingStoryPage()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('reserves the header box with the same padding it will have once loaded', () => {
    renderLoadingStoryPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1 }))
    expect(tokensOf(header)).toEqual(expect.arrayContaining(CANONICAL_PADDING))
  })

  it('draws a pulsing placeholder in the header rather than an empty page', () => {
    renderLoadingStoryPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1 }))
    expect(header.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('announces no fake title, so the skeleton is never read out as the story name', () => {
    renderLoadingStoryPage()

    const header = pageHeaderAround(screen.getByRole('heading', { level: 1 }))
    for (const skeleton of header.querySelectorAll('.animate-pulse')) {
      expect(skeleton.textContent).toBe('')
    }
  })
})

describe('StoryDetailPage column layout (AC4)', () => {
  it('lets the phone page scroll as one document instead of nesting a scroll region', async () => {
    const { container } = await renderStoryPage(375)

    const tokens = tokensOf(mainColumnOf(container))
    expect(tokens, 'a nested scroller traps the phone reader').toContain('overflow-visible')
    expect(tokens, 'the desktop column still scrolls on its own').toContain('lg:overflow-y-auto')
    expect(tokens).not.toContain('overflow-y-auto')
  })

  // `lg:order-last` beats the main column's default `order: 0` on its own, so the
  // rail sits right at lg with NO order class on the main column — T15 can adopt
  // the rail without copying anything onto its own content column.
  it('flips the rail to the right-hand track at lg with no order class on the main column', async () => {
    const { container } = await renderStoryPage(1280)

    expect(tokensOf(railOf(container))).toContain('lg:order-last')
    expect(
      tokensOf(mainColumnOf(container)).filter((token) => token.replace('lg:', '').startsWith('order-')),
      'ordering the rail must not depend on classes the adopter has to remember'
    ).toEqual([])
  })

  it('widens the rail track to the 300px used across the detail pages', async () => {
    const { container } = await renderStoryPage()

    const tokens = tokensOf(gridOf(container))
    expect(tokens).toContain('lg:grid-cols-[1fr_300px]')
    expect(tokens, 'the 280px track is being normalised away').not.toContain(
      'lg:grid-cols-[1fr_280px]'
    )
  })
})

describe('StoryDetailPage rail at 1280px (AC1)', () => {
  it('keeps every class the rail carries today', async () => {
    const { container } = await renderStoryPage(1280)

    expect(tokensOf(railOf(container))).toEqual(expect.arrayContaining(TODAYS_ASIDE_TOKENS))
  })

  it('keeps the left rule at lg and adds no disclosure affordance', async () => {
    const { container } = await renderStoryPage(1280)

    const rail = railOf(container)
    expect(tokensOf(rail)).toContain('lg:border-l')
    expect(
      within(rail)
        .queryAllByRole('button')
        .filter((el) => el.hasAttribute('aria-expanded')),
      'the desktop rail must look exactly as it does today'
    ).toEqual([])
  })

  it('shows the status history without any interaction', async () => {
    const { container } = await renderStoryPage(1280)

    expect(await within(railOf(container)).findByText('No history yet')).toBeVisible()
  })
})

describe('StoryDetailPage rail at 375px (AC2, AC3)', () => {
  it('draws its rule along the bottom rather than dangling one down the side', async () => {
    const { container } = await renderStoryPage(375)

    const tokens = tokensOf(railOf(container))
    expect(tokens).toContain('border-b')
    expect(tokens).not.toContain('border-l')
  })

  // Painting the rail first is not enough: below lg it must also come first in
  // the DOM, or a screen-reader and keyboard user still traverses the
  // description, the task list and every comment before reaching "Details"
  // (WCAG 1.3.2 / 2.4.3). With the rail first and no `order` set anywhere below
  // lg, DOM order IS visual order.
  it('sits above the main content, and comes first in the DOM to match', async () => {
    const { container } = await renderStoryPage(375)

    const children = Array.from(gridOf(container).children)
    expect(
      children.indexOf(railOf(container)),
      'the rail must precede the main column in the DOM'
    ).toBeLessThan(children.indexOf(mainColumnOf(container)))
    expect(
      tokensOf(railOf(container)).filter((token) => token.startsWith('order-')),
      'any unprefixed order class would divorce the visual order from the DOM order'
    ).toEqual([])
  })

  it('lays its fields two across', async () => {
    const { container } = await renderStoryPage(375)

    const rail = railOf(container)
    const fields = within(rail).getByText('Status').closest('div')?.parentElement as HTMLElement
    const tokens = tokensOf(fields)
    expect(tokens).toContain('grid-cols-2')
    expect(tokens).toContain('lg:grid-cols-1')
  })

  it('names the rail disclosure with the new detail.details string', async () => {
    await renderStoryPage(375)

    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('starts the status history collapsed, so it does not push the fields down', async () => {
    const { container } = await renderStoryPage(375)

    const toggle = within(railOf(container)).getByRole('button', { name: 'Status History' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('No history yet')).not.toBeInTheDocument()
  })

  it('reveals the status history when the reader expands it', async () => {
    const user = userEvent.setup()
    const { container } = await renderStoryPage(375)

    await user.click(within(railOf(container)).getByRole('button', { name: 'Status History' }))

    expect(await screen.findByText('No history yet')).toBeVisible()
  })
})

describe('StoryDetailPage rail controls on a phone', () => {
  it('changes the story status from the rail without expanding anything first', async () => {
    const user = userEvent.setup()
    const { container } = await renderStoryPage(375)

    await user.selectOptions(railControlOffering(railOf(container), 'To Do'), 'done')

    expect(storiesApi.update).toHaveBeenCalledWith('story-1', { status: 'done' })
    expect(await screen.findByText('Status updated')).toBeVisible()
  })

  it('changes the story priority from the rail', async () => {
    const user = userEvent.setup()
    const { container } = await renderStoryPage(375)

    await user.selectOptions(railControlOffering(railOf(container), 'Medium'), 'high')

    expect(storiesApi.update).toHaveBeenCalledWith('story-1', { priority: 'high' })
  })

  it('tells the reader when saving the status from the rail fails', async () => {
    const user = userEvent.setup()
    const { container } = await renderStoryPage(375)
    vi.mocked(storiesApi.update).mockRejectedValueOnce(new Error('boom'))

    await user.selectOptions(railControlOffering(railOf(container), 'To Do'), 'done')

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeVisible()
  })

  it('leaves the rail on screen after a failed save rather than blanking the page', async () => {
    const user = userEvent.setup()
    const { container } = await renderStoryPage(375)
    vi.mocked(storiesApi.update).mockRejectedValueOnce(new Error('boom'))

    await user.selectOptions(railControlOffering(railOf(container), 'To Do'), 'done')

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
    expect(railOf(container)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Login flow' })).toBeVisible()
  })
})

describe('StoryDetailPage rail accessibility', () => {
  it('exposes the rail as a landmark named by the new detail.details string', async () => {
    await renderStoryPage(1280)

    expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument()
  })

  // Beyond the verbatim ACs, but the ticket's whole point is that these two
  // controls are *reachable* on a phone: today neither <select> has any
  // accessible name at all, so a screen-reader user hears "combo box" twice.
  it('gives the rail status control an accessible name', async () => {
    const { container } = await renderStoryPage(375)

    expect(within(railOf(container)).getByRole('combobox', { name: 'Status' })).toBeInTheDocument()
  })

  it('gives the rail priority control an accessible name', async () => {
    const { container } = await renderStoryPage(375)

    expect(
      within(railOf(container)).getByRole('combobox', { name: 'Priority' })
    ).toBeInTheDocument()
  })
})

describe('detail.details translation', () => {
  it('is defined in en-GB', () => {
    expect((enGB as Record<string, string>)['detail.details']).toBeTruthy()
  })

  it('is defined in pl', () => {
    expect((pl as Record<string, string>)['detail.details']).toBeTruthy()
  })
})
