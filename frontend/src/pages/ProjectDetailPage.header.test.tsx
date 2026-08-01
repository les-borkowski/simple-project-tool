import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { expectCanonicalHeader, pageHeaderAround } from '../test/pageHeaderRecipe'
import { makeProject, makeProjectStatus, makeUser } from '../test/factories'
import { tabId } from '../utils/tabId'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, ProjectResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T13a — ProjectDetailPage: header, breadcrumbs, tab rail.
//
// Scope is sub-ticket (a) only. Nothing here touches the toolbars, the kanban
// board or the three inline overlays (T13b/c), nor the stories table (T14).
//
// "The page uses PageHeader / Breadcrumbs / Tabs" is not directly observable —
// a component boundary is an internal — so it is asserted through its
// user-visible consequences: the canonical header container recipe, a real
// navigation landmark for the trail, and real tablist/tab semantics with roving
// tabindex and arrow navigation. An implementation that inlines the same
// rendered result by hand passes, and that is fine: the rendered result is what
// users get.
//
// jsdom computes no layout (`getBoundingClientRect()` is all zeros and
// vitest.config.ts sets `css: false`), so every "it scrolls sideways / it does
// not wrap" claim is a class-token assertion plus a `scrollIntoView` spy, never
// a measurement. Class tokens are read off `classList` so `px-7` cannot
// accidentally match inside `md:px-7`.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      get: vi.fn(),
      listMembers: vi.fn(),
      update: vi.fn().mockResolvedValue({ data: {} }),
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
    sprintsApi: {
      ...actual.sprintsApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn(),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      get: vi.fn(),
      update: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
})

import { preferencesApi, projectsApi, statusesApi } from '../services/api'

const DEFAULT_TAB_ORDER = ['board', 'stories', 'sprints', 'timeline', 'members']
const ALL_TAB_KEYS = [...DEFAULT_TAB_ORDER, 'settings']
const ALL_TAB_NAMES = ['Board', 'Stories', 'Sprints', 'Timeline', 'Members', 'Settings']

// The namespace the page hands Tabs, so the tab ids stay stable and derivable
// for the panel wrappers T13c will label with them.
const TABS_ID = 'project-tabs'

// The header's status and priority triggers name themselves after the field
// they edit, so neither is announced as a bare value.
const STATUS_TRIGGER = 'Status: To Do'
const PRIORITY_TRIGGER = 'Priority: Medium'

function makeApolloProject(overrides: Partial<ProjectResponse> = {}): ProjectResponse {
  return makeProject({
    id: 'proj-1',
    name: 'Apollo',
    description: 'Ship the login flow',
    status: 'to_do',
    priority: 'medium',
    ...overrides,
  })
}

interface RenderOptions {
  route?: string
  project?: ProjectResponse
  tabOrder?: string[]
  hiddenTabs?: string[]
  /** Leaves `projectsApi.get` pending so the loading header can be observed. */
  neverResolve?: boolean
}

function renderProjectDetailPage({
  route = '/projects/proj-1',
  project = makeApolloProject(),
  tabOrder = DEFAULT_TAB_ORDER,
  hiddenTabs = [],
  neverResolve = false,
}: RenderOptions = {}) {
  // A fixed id keeps the avatar's colour class stable across renders, so the
  // markup comparisons below compare layout and nothing else.
  const manager = makeUser({ id: 'user-manager', role: 'manager', name: 'Ada Lovelace' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockReturnValue(
    (neverResolve ? new Promise(() => {}) : Promise.resolve({ data: project })) as never
  )
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(statusesApi.list).mockResolvedValue({
    data: [
      makeProjectStatus({ slug: 'to_do', name: 'To Do', order: 0 }),
      makeProjectStatus({ slug: 'done', name: 'Done', order: 1 }),
    ],
  } as never)
  vi.mocked(preferencesApi.get).mockResolvedValue({
    data: {
      id: 'pref-1',
      user_id: manager.id,
      project_id: 'proj-1',
      tab_order: tabOrder,
      hidden_tabs: hiddenTabs,
      created_at: new Date().toISOString(),
    },
  } as never)

  const view = renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route,
    auth: { user: manager, isAuthenticated: true },
  })

  return { ...view, project, manager }
}

async function renderLoadedPage(options: RenderOptions = {}) {
  const view = renderProjectDetailPage(options)
  await screen.findByRole('heading', { level: 1, name: view.project.name })
  return view
}

/**
 * PageHeader's actions slot: the block that takes the full width of its own
 * line on a phone and sits beside the title from md up.
 */
function actionsSlotOf(header: HTMLElement): Element | null {
  return header.querySelector('.w-full.md\\:w-auto')
}

function tabRail(): HTMLElement {
  const rails = screen.getAllByRole('tablist')
  expect(rails, 'the project header has exactly one tab rail').toHaveLength(1)
  return rails[0]
}

function tabNames(): string[] {
  return within(tabRail())
    .getAllByRole('tab')
    .map((tab) => tab.textContent?.trim() ?? '')
}

/** useId counters are global and never reset, so ids say nothing about layout. */
function normaliseIds(html: string): string {
  return html.replace(/(id|aria-labelledby|aria-controls|aria-describedby)="[^"]*"/g, '$1="stable"')
}

// ---------------------------------------------------------------------------
// AC2 — the page adopts PageHeader, loading state included
// ---------------------------------------------------------------------------

describe('ProjectDetailPage header adopts PageHeader', () => {
  it('renders its header with the canonical padding recipe and sticky offset', async () => {
    await renderLoadedPage()

    expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Apollo' }))
  })

  it('shows a skeleton header, level-1 heading and all, while the project loads', () => {
    renderProjectDetailPage({ neverResolve: true })

    const heading = screen.getByRole('heading', { level: 1 })
    const root = expectCanonicalHeader(heading)

    expect(
      root.querySelectorAll('.animate-pulse').length,
      'the loading header must draw placeholders'
    ).toBeGreaterThan(0)
    expect(heading, 'the skeleton must not be announced as a real title').toHaveTextContent('')
  })

  it('reserves the breadcrumb line while loading, so the header does not jump', () => {
    renderProjectDetailPage({ neverResolve: true })

    const root = expectCanonicalHeader(screen.getByRole('heading', { level: 1 }))

    expect(
      root.querySelector(':scope > .mb-2'),
      'the loading header must reserve the crumb line it will fill'
    ).not.toBeNull()
  })

  it('reserves the actions line while loading, so the body does not shift when the project arrives', async () => {
    // The loaded header always draws an actions cluster — the avatar stack sits
    // outside the manager gate — and at 375px that cluster takes a line of its
    // own. A loading header without it is ~44px shorter, so everything below
    // jumps down the moment the fetch resolves.
    setViewportWidth(375)
    const loading = renderProjectDetailPage({ neverResolve: true })
    const loadingSlot = actionsSlotOf(
      expectCanonicalHeader(screen.getByRole('heading', { level: 1 }))
    )
    loading.unmount()

    await renderLoadedPage()
    const loadedSlot = actionsSlotOf(
      expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Apollo' }))
    )

    expect(loadedSlot, 'the loaded header always draws an actions cluster').not.toBeNull()
    expect(loadingSlot, 'the loading header must reserve the actions line too').not.toBeNull()
  })

  it('renders the project description as the header subtitle', async () => {
    await renderLoadedPage()

    const subtitle = screen.getByText('Ship the login flow')

    expect(subtitle.tagName, 'the subtitle is PageHeader’s <p> slot').toBe('P')
    expect(Array.from(subtitle.classList)).toEqual(
      expect.arrayContaining(['text-ui-md', 'text-stone-500', 'mt-0.5'])
    )
  })

  it('exposes the project name as the page’s only level-1 heading', async () => {
    await renderLoadedPage()

    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveAccessibleName('Apollo')
  })
})

// ---------------------------------------------------------------------------
// AC2 — the hand-rolled crumb line becomes Breadcrumbs
// ---------------------------------------------------------------------------

describe('ProjectDetailPage breadcrumbs', () => {
  it('renders the trail as a navigation landmark linking back to Projects', async () => {
    await renderLoadedPage()

    const trail = screen.getByRole('navigation')
    const projectsLink = within(trail).getByRole('link', { name: 'Projects' })

    expect(projectsLink).toHaveAttribute('href', '/projects')
  })

  it('shows the project name as the final, unlinked crumb', async () => {
    await renderLoadedPage()

    const trail = screen.getByRole('navigation')

    expect(within(trail).getByText('Apollo')).toBeInTheDocument()
    expect(
      within(trail).queryByRole('link', { name: 'Apollo' }),
      'the current page must not link to itself'
    ).not.toBeInTheDocument()
  })

  it('puts the trail above the title', async () => {
    await renderLoadedPage()

    const trail = screen.getByRole('navigation')
    const heading = screen.getByRole('heading', { level: 1, name: 'Apollo' })

    expect(pageHeaderAround(heading)).toContainElement(trail)
    expect(trail.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// R1 — the status pill and priority control move to the titleAdornment slot
// ---------------------------------------------------------------------------

describe('ProjectDetailPage title adornment', () => {
  it('keeps the status pill and priority control beside the title in the header', async () => {
    await renderLoadedPage()

    const heading = screen.getByRole('heading', { level: 1, name: 'Apollo' })
    const header = expectCanonicalHeader(heading)
    const status = screen.getByRole('button', { name: STATUS_TRIGGER })
    const priority = screen.getByRole('button', { name: PRIORITY_TRIGGER })

    expect(header).toContainElement(status)
    expect(header).toContainElement(priority)
    expect(
      heading.parentElement,
      'the controls share the heading’s row, as they do today'
    ).toContainElement(status)
    expect(heading.parentElement).toContainElement(priority)
  })

  it('names the status and priority triggers after the field each one edits', async () => {
    // Visually the pill and the bars say which is which; a screen reader
    // announcing "To Do, button" and "Medium, button" does not. The rail's
    // controls (T11) already name themselves "Status" and "Priority".
    await renderLoadedPage()

    const header = expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Apollo' }))

    expect(within(header).getByRole('button', { name: STATUS_TRIGGER })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: PRIORITY_TRIGGER })).toBeInTheDocument()
    expect(
      within(header).queryByRole('button', { name: 'To Do' }),
      'the value alone leaves a non-visual user guessing which field it is'
    ).not.toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: 'Medium' })).not.toBeInTheDocument()
  })

  it('names the editors those triggers swap in', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    const header = expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Apollo' }))
    await user.click(within(header).getByRole('button', { name: STATUS_TRIGGER }))

    expect(await within(header).findByRole('combobox', { name: 'Status' })).toBeInTheDocument()

    await user.click(within(header).getByRole('button', { name: PRIORITY_TRIGGER }))

    expect(await within(header).findByRole('combobox', { name: 'Priority' })).toBeInTheDocument()
  })

  it('never nests a control inside the level-1 heading', async () => {
    // Passing these through `title` would make heading navigation announce
    // "Apollo To Do Medium" and bury buttons inside an <h1>.
    await renderLoadedPage()

    const heading = screen.getByRole('heading', { level: 1, name: 'Apollo' })

    expect(heading.querySelector('button, select, a')).toBeNull()
    expect(heading).toHaveAccessibleName('Apollo')
  })

  it('opens the status editor when the pill beside the title is used from the keyboard', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    screen.getByRole('button', { name: STATUS_TRIGGER }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: STATUS_TRIGGER })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'To do' })).toBeInTheDocument()
  })

  it('shows the archived badge beside the title for an archived project', async () => {
    await renderLoadedPage({
      project: makeApolloProject({ archived_at: new Date().toISOString() }),
    })

    const heading = screen.getByRole('heading', { level: 1, name: 'Apollo' })

    expect(heading.parentElement).toContainElement(screen.getByText('Archived'))
  })
})

// ---------------------------------------------------------------------------
// R5 — the hand-rolled "New" dropdown becomes the shared Menu
// ---------------------------------------------------------------------------

describe('ProjectDetailPage New menu', () => {
  async function openNewMenu(user: ReturnType<typeof userEvent.setup>) {
    const trigger = screen.getByRole('button', { name: /^New$/ })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    return trigger
  }

  it('offers Story and Task on a click alone, with no hover', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openNewMenu(user)

    expect(await screen.findByRole('button', { name: 'Story' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Task' })).toBeInTheDocument()
  })

  it('renders the menu outside the page container so no scroll parent can clip it', async () => {
    const user = userEvent.setup()
    const { container } = await renderLoadedPage()

    await openNewMenu(user)

    const storyItem = await screen.findByRole('button', { name: 'Story' })
    expect(container, 'the menu must be portalled, like every other Menu').not.toContainElement(
      storyItem
    )
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    const trigger = await openNewMenu(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Story' })).not.toBeInTheDocument()
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(trigger)
  })

  it('opens the new-story form when Story is chosen', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openNewMenu(user)
    await user.click(await screen.findByRole('button', { name: 'Story' }))

    expect(await screen.findByText('New story')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Task' })).not.toBeInTheDocument()
  })

  it('opens the new-task form when Task is chosen', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openNewMenu(user)
    await user.click(await screen.findByRole('button', { name: 'Task' }))

    expect(await screen.findByText('New task')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AC1 — the six-tab rail
// ---------------------------------------------------------------------------

describe('ProjectDetailPage tab rail', () => {
  it('renders the six project tabs as one named tablist', async () => {
    await renderLoadedPage()

    const rail = tabRail()
    const name = rail.getAttribute('aria-label') ?? ''

    expect(tabNames()).toEqual(ALL_TAB_NAMES)
    expect(name.length, 'the tab rail needs an accessible name').toBeGreaterThan(0)
    expect(name, 'the name must be translated, not a raw i18n key').not.toMatch(
      /^[a-z_]+\.[a-z_]+$/
    )
  })

  it('marks the tab named by the ?tab= query as the selected one', async () => {
    await renderLoadedPage({ route: '/projects/proj-1?tab=members' })

    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'false')
  })

  it('keeps exactly one tab in the page tab order', async () => {
    await renderLoadedPage()

    const inTabOrder = within(tabRail())
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('tabindex') === '0')

    expect(inTabOrder).toHaveLength(1)
    expect(inTabOrder[0]).toHaveAccessibleName('Board')
  })

  it('moves selection along the rail with the arrow keys', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    screen.getByRole('tab', { name: 'Board' }).focus()
    await user.keyboard('{ArrowRight}')

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Stories' }))
    expect(screen.getByRole('tab', { name: 'Stories' })).toHaveAttribute('aria-selected', 'true')
  })

  it('reaches Settings from the rail and shows the tab preferences panel', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderLoadedPage()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))

    expect(
      await screen.findByText('Drag to reorder tabs or toggle their visibility.')
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true')
  })

  it('gives every tab an id derived from the page’s own namespace', async () => {
    // Not merely unique — derivable. The panel wrappers T13c adds have to point
    // `aria-labelledby` at these ids without reaching into the DOM, which they
    // can only do while the page names the tablist rather than letting `useId`
    // mint a render-dependent one.
    await renderLoadedPage()

    const ids = within(tabRail())
      .getAllByRole('tab')
      .map((tab) => tab.id)

    expect(ids).toEqual(ALL_TAB_KEYS.map((key) => tabId(TABS_ID, key)))
  })

  it('scrolls a newly activated tab into view, so an off-screen tab is reachable', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    setViewportWidth(375)
    await renderLoadedPage()

    scrollIntoView.mockClear()
    await user.click(screen.getByRole('tab', { name: 'Settings' }))

    expect(scrollIntoView.mock.contexts).toContain(screen.getByRole('tab', { name: 'Settings' }))
  })

  it('does not re-scroll the rail when the header re-renders without a tab change', async () => {
    // The rail's scrollIntoView effect depends on the items array, so a freshly
    // built array on every parent render would yank the strip back under the
    // user's finger each time anything in the header changes.
    const user = userEvent.setup()
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    setViewportWidth(375)
    await renderLoadedPage()

    expect(tabNames()).toEqual(ALL_TAB_NAMES)
    scrollIntoView.mockClear()

    // Any header interaction that re-renders the page but leaves the tab alone.
    await user.click(screen.getByRole('button', { name: STATUS_TRIGGER }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: STATUS_TRIGGER })).not.toBeInTheDocument()
    })

    const scrolledTabs = scrollIntoView.mock.contexts.filter(
      (context) => context instanceof Element && context.getAttribute('role') === 'tab'
    )
    expect(scrolledTabs, 'the tab items must be memoised, not rebuilt each render').toEqual([])
  })

  it('keeps the rail keyboard-reachable when the active tab has been hidden', async () => {
    await renderLoadedPage({
      route: '/projects/proj-1?tab=board',
      hiddenTabs: ['board'],
    })

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Board' })).not.toBeInTheDocument()
    })

    const tabs = within(tabRail()).getAllByRole('tab')
    const inTabOrder = tabs.filter((tab) => tab.getAttribute('tabindex') === '0')

    expect(tabNames()).toEqual(['Stories', 'Sprints', 'Timeline', 'Members', 'Settings'])
    expect(inTabOrder, 'a stale ?tab= must not strand the rail outside the tab order').toHaveLength(
      1
    )
  })

  it('respects a reordered rail', async () => {
    await renderLoadedPage({ tabOrder: ['members', 'board', 'stories', 'sprints', 'timeline'] })

    await waitFor(() => {
      expect(tabNames()).toEqual(['Members', 'Board', 'Stories', 'Sprints', 'Timeline', 'Settings'])
    })
  })

  it('lets the rail scroll sideways at 375px instead of wrapping', async () => {
    setViewportWidth(375)
    await renderLoadedPage()

    const tokens = Array.from(tabRail().classList)

    expect(tokens, 'the rail must scroll sideways on a phone').toContain('overflow-x-auto')
    expect(tokens).toContain('flex')
    expect(tokens, 'a wrapping rail hides the Settings tab on a second line').not.toContain(
      'flex-wrap'
    )
  })

  it('keeps every tab from shrinking or wrapping at 375px', async () => {
    setViewportWidth(375)
    await renderLoadedPage()

    for (const tab of within(tabRail()).getAllByRole('tab')) {
      const tokens = Array.from(tab.classList)
      expect(tokens, `"${tab.textContent}" must not shrink`).toContain('shrink-0')
      expect(tokens, `"${tab.textContent}" must not wrap`).toContain('whitespace-nowrap')
    }
  })
})

// ---------------------------------------------------------------------------
// Global constraint 4 — the desktop shell (≥1024px) is unchanged
// ---------------------------------------------------------------------------

describe('ProjectDetailPage at the desktop shell width', () => {
  it('renders the same six tabs in the same order at 1280px', async () => {
    setViewportWidth(1280)
    await renderLoadedPage()

    expect(tabNames()).toEqual(ALL_TAB_NAMES)
    expect(tabRail()).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('renders identical header markup at 375px and 1280px', async () => {
    setViewportWidth(375)
    const mobile = await renderLoadedPage()
    const mobileHtml = normaliseIds(
      pageHeaderAround(screen.getByRole('heading', { level: 1, name: 'Apollo' })).outerHTML
    )
    mobile.unmount()

    setViewportWidth(1280)
    await renderLoadedPage()

    expect(
      normaliseIds(pageHeaderAround(screen.getByRole('heading', { level: 1, name: 'Apollo' })).outerHTML)
    ).toBe(mobileHtml)
  })

  it('renders identical tab rail markup at 375px and 1280px', async () => {
    setViewportWidth(375)
    const mobile = await renderLoadedPage()
    const mobileHtml = normaliseIds(tabRail().outerHTML)
    mobile.unmount()

    setViewportWidth(1280)
    await renderLoadedPage()

    expect(normaliseIds(tabRail().outerHTML)).toBe(mobileHtml)
  })
})
