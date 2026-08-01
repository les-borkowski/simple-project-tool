/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { makeProject, makeProjectStatus, makeStory, makeTask, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, StoryResponse, TaskResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T13c — ProjectDetailPage: the board/stories toolbars and the kanban scroller.
//
// Scope is sub-ticket (c) only. Nothing here touches the header, breadcrumbs or
// tab rail (T13a), the four overlays (T13b) or the stories *table rows* (T14) —
// only the stories *toolbar* belongs to this ticket.
//
// jsdom computes no layout: getBoundingClientRect() is all zeros and
// vitest.config.ts sets `css: false`, so no Tailwind rule ever applies. That
// means "the toolbar wraps", "nothing is clipped at 375px", "the board snaps
// one column per swipe", "the edges fade" and above all AC3 "no horizontal body
// scroll at 320px" are NOT measurable here. Every such claim below is expressed
// as a class-token assertion (read off `classList`, so `px-7` cannot
// accidentally match inside `md:px-7`) or as a source-text assertion, in the
// style of src/index.css.test.ts and src/dragTouchSensors.sourceLint.test.ts.
// The real geometry — wrap points, the 24px mask fade, snap behaviour and the
// 320px body overflow — is measured in the browser pass, not here.
//
// AC3 in particular is expressed as its two mechanical causes: the toolbars
// must be allowed to wrap, and their flat `px-7` gutter must become a
// responsive one. The measured 283px of overflow at 375px comes from the three
// board <select>s plus the count span sitting on one unwrappable row.
//
// The board is dnd-kit powered. Live drag is not verifiable in this
// environment (recorded from T05/T06), so nothing here drags anything; the
// snap classes are asserted on the elements that must carry them and the drag
// itself is left to the device pass.
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
    },
    storiesApi: {
      ...actual.storiesApi,
      list: vi.fn(),
    },
    tasksApi: {
      ...actual.tasksApi,
      list: vi.fn(),
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

import { preferencesApi, projectsApi, statusesApi, storiesApi, tasksApi } from '../services/api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PAGE_SOURCE_PATH = path.join(__dirname, 'ProjectDetailPage.tsx')

const SEARCH_LABEL = 'Search…'
const STORY: StoryResponse = makeStory({
  id: 'story-1',
  project_id: 'proj-1',
  title: 'Login flow',
  status: 'todo',
})

/**
 * One task per project status plus one carrying a status the project no longer
 * lists, so the board renders BOTH column sites: the project-status columns and
 * the "Unlisted statuses" section. Both have to get the snap treatment.
 */
const TASKS: TaskResponse[] = [
  makeTask({ id: 'task-1', project_id: 'proj-1', story_id: 'story-1', title: 'Wire the form', status: 'to_do' }),
  makeTask({ id: 'task-2', project_id: 'proj-1', story_id: 'story-1', title: 'Ship it', status: 'done' }),
  makeTask({ id: 'task-3', project_id: 'proj-1', story_id: 'story-1', title: 'Await review', status: 'in_review' }),
]

/**
 * Each board column, named for a user, identified by the card it holds. The
 * column *heading* is not usable as an anchor: a card's status pill repeats it,
 * so "in_review" matches twice. The first two are project-status columns; the
 * third is rendered by the separate "Unlisted statuses" branch.
 */
const COLUMNS = [
  { name: 'To Do', card: 'Wire the form' },
  { name: 'Done', card: 'Ship it' },
  { name: 'in_review (unlisted)', card: 'Await review' },
] as const

const LISTED_COLUMN = COLUMNS[0]
const UNLISTED_COLUMN = COLUMNS[2]

function primeApi() {
  const manager = makeUser({ id: 'user-manager', role: 'manager', name: 'Ada Lovelace' })
  const project = makeProject({ id: 'proj-1', name: 'Apollo' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({
    data: { items: [STORY], next_cursor: null },
  } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({
    data: { items: TASKS, next_cursor: null },
  } as never)
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
      tab_order: ['board', 'stories', 'sprints', 'timeline', 'members'],
      hidden_tabs: [],
      created_at: new Date().toISOString(),
    },
  } as never)

  return { manager, project }
}

async function renderBoardTab(width = 375) {
  setViewportWidth(width)
  const { manager, project } = primeApi()
  const view = renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=board',
    auth: { user: manager, isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: project.name })
  // The board only fills in once the per-story task fetch resolves.
  await screen.findByText(UNLISTED_COLUMN.card)
  return view
}

async function renderStoriesTab(width = 375) {
  setViewportWidth(width)
  const { manager, project } = primeApi()
  const view = renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=stories',
    auth: { user: manager, isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: project.name })
  await screen.findByRole('combobox', { name: 'Sort by' })
  return view
}

function tokens(el: Element): string[] {
  return Array.from(el.classList)
}

/** The lowest element that contains every one of `nodes`. */
function commonAncestor(nodes: Element[]): HTMLElement {
  let node: HTMLElement | null = nodes[0] as HTMLElement
  while (node && !nodes.every((n) => node!.contains(n))) {
    node = node.parentElement
  }
  if (!node) throw new Error('No common ancestor found for the given elements')
  return node
}

/** The child of `parent` that contains (or is) `descendant`. */
function childContaining(parent: Element, descendant: Element): HTMLElement {
  let node: HTMLElement | null = descendant as HTMLElement
  while (node && node.parentElement !== parent) {
    node = node.parentElement
  }
  if (!node) throw new Error('The given element is not a descendant of the given parent')
  return node
}

const PADDING_TOKEN = /^(?:[a-z0-9.]+:)?(?:p|px|pl|pr)-/

/**
 * The element that owns a toolbar's horizontal gutter: the toolbar itself if it
 * pads itself, otherwise the nearest padded ancestor (the stories toolbar
 * inherits its gutter from the tab panel). Starting from the toolbar rather
 * than a control avoids matching a control's own `px-2.5`.
 */
function horizontalPaddingOwner(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from
  while (node) {
    if (tokens(node).some((token) => PADDING_TOKEN.test(token))) return node
    node = node.parentElement
  }
  throw new Error('No ancestor declares a horizontal padding utility')
}

function expectResponsiveGutter(owner: HTMLElement, what: string) {
  const owned = tokens(owner)
  expect(
    owned,
    `${what} must drop to the phone gutter at 375px; a flat px-7 (28px each side) is ` +
      'part of the 283px of horizontal overflow measured on this page.'
  ).toContain('px-4')
  expect(owned, `${what} must restore the 28px desktop gutter from md up`).toContain('md:px-7')
  expect(
    owned,
    `${what} still carries an unprefixed px-7, so the phone gutter never applies`
  ).not.toContain('px-7')
}

/** The board toolbar row: the element holding the search field and all three filters. */
function boardToolbar(): HTMLElement {
  const controls = [
    screen.getByRole('textbox', { name: SEARCH_LABEL }),
    screen.getByRole('combobox', { name: 'Priority' }),
    screen.getByRole('combobox', { name: 'Assignee' }),
    screen.getByRole('combobox', { name: 'Story' }),
  ]
  return commonAncestor(controls)
}

/** The full board toolbar, filters plus the task/done count on its right. */
function boardToolbarWithCount(): HTMLElement {
  return commonAncestor([boardToolbar(), boardCount()])
}

function boardCount(): HTMLElement {
  return screen.getByText(/\d+ tasks? · \d+ done/)
}

/** The stories toolbar row: search plus the status, priority and sort filters. */
function storiesToolbar(): HTMLElement {
  const controls = [
    screen.getByRole('textbox', { name: SEARCH_LABEL }),
    screen.getByRole('combobox', { name: 'Status' }),
    screen.getByRole('combobox', { name: 'Priority' }),
    screen.getByRole('combobox', { name: 'Sort by' }),
  ]
  return commonAncestor(controls)
}

/**
 * The board's horizontal track — the flex row holding every column. Derived as
 * the lowest element containing both a project-status column and an unlisted
 * one, so it survives any wrapper the implementation adds.
 */
function boardTrack(): HTMLElement {
  return commonAncestor([
    screen.getByText(LISTED_COLUMN.card),
    screen.getByText(UNLISTED_COLUMN.card),
  ])
}

/**
 * The board's horizontal scroll container. It carries no role — it is a
 * scrolling surface, not a widget — so it is identified as the nearest ancestor
 * of the track that actually scrolls sideways.
 */
function boardScroller(): HTMLElement {
  let node: HTMLElement | null = boardTrack().parentElement
  while (node && !tokens(node).includes('overflow-x-auto')) {
    node = node.parentElement
  }
  if (!node) {
    throw new Error(
      'No ancestor of the board track carries overflow-x-auto: the kanban has no horizontal ' +
        'scroll container, so it cannot snap or fade.'
    )
  }
  return node
}

function boardColumn(cardTitle: string): HTMLElement {
  return childContaining(boardTrack(), screen.getByText(cardTitle))
}

// Where a swipe comes to rest. `snap-end` is excluded deliberately: it would
// park each column against the right edge, under the fade.
const SNAP_ALIGNMENTS = ['snap-start', 'snap-center']

/** useId counters never reset, so ids say nothing about layout. */
function normaliseIds(html: string): string {
  return html.replace(/(id|aria-labelledby|aria-controls|aria-describedby)="[^"]*"/g, '$1="stable"')
}

// ---------------------------------------------------------------------------
// AC1 — the board toolbar wraps at 375px with nothing clipped
// ---------------------------------------------------------------------------

describe('ProjectDetailPage board toolbar at 375px', () => {
  it('lets the filter controls wrap onto a second line instead of overflowing the screen', async () => {
    await renderBoardTab()

    const toolbar = boardToolbar()

    expect(tokens(toolbar), 'the toolbar is still a flex row').toContain('flex')
    expect(
      tokens(toolbar),
      'the search field and the priority/assignee/story selects sit on one unwrappable row; at ' +
        '375px, with every control 16px tall-text per T02, that row is the measured cause of the ' +
        'page’s 283px of horizontal overflow'
    ).toContain('flex-wrap')
  })

  it('keeps the task and done counts inside the wrapping row so they can drop to the next line', async () => {
    await renderBoardTab()

    const toolbar = boardToolbarWithCount()

    expect(boardCount(), 'the counts must still be on screen at 375px').toBeVisible()
    expect(
      tokens(toolbar),
      'the count span is pushed right by a flex-1 spacer, so on an unwrapped row it is the last ' +
        'thing to overflow and the first thing clipped'
    ).toContain('flex-wrap')
  })

  it('pads the board toolbar to the phone gutter and restores the desktop one from md up', async () => {
    await renderBoardTab()

    expectResponsiveGutter(horizontalPaddingOwner(boardToolbarWithCount()), 'the board toolbar')
  })

  it('keeps every board filter reachable and named once the row wraps', async () => {
    // Wrapping must not cost the toolbar its keyboard order or its labels: a
    // control that moved to a second visual line is still the next tab stop.
    const user = userEvent.setup()
    await renderBoardTab()

    const search = screen.getByRole('textbox', { name: SEARCH_LABEL })
    search.focus()

    for (const name of ['Priority', 'Assignee', 'Story']) {
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name }))
    }
  })

  it('gives no board toolbar control a fixed width wider than a 320px screen', async () => {
    // AC3, as close as jsdom can get: with a 16px gutter each side there are
    // 288px of usable width at 320px, so any hard-coded pixel width above that
    // overflows the body no matter how the row wraps.
    await renderBoardTab()

    const offenders = Array.from(boardToolbarWithCount().querySelectorAll('*'))
      .flatMap((el) => tokens(el).map((token) => ({ el, token })))
      .filter(({ token }) => {
        const match = token.match(/^(?:min-)?w-\[(\d+(?:\.\d+)?)px\]$/)
        return match !== null && parseFloat(match[1]) > 288
      })
      .map(({ el, token }) => `${el.tagName.toLowerCase()}.${token}`)

    expect(
      offenders,
      'a control wider than 288px cannot fit a 320px screen and forces horizontal body scroll'
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// AC1 — the stories toolbar wraps at 375px with nothing clipped
// ---------------------------------------------------------------------------

describe('ProjectDetailPage stories toolbar at 375px', () => {
  it('lets the filter controls wrap onto a second line instead of overflowing the screen', async () => {
    await renderStoriesTab()

    const toolbar = storiesToolbar()

    expect(tokens(toolbar), 'the toolbar is still a flex row').toContain('flex')
    expect(
      tokens(toolbar),
      'search plus the status, priority and sort selects cannot fit one 375px row'
    ).toContain('flex-wrap')
  })

  it('pads the stories toolbar to the phone gutter and restores the desktop one from md up', async () => {
    await renderStoriesTab()

    expectResponsiveGutter(horizontalPaddingOwner(storiesToolbar()), 'the stories toolbar gutter')
  })

  it('keeps every stories filter reachable and named once the row wraps', async () => {
    const user = userEvent.setup()
    await renderStoriesTab()

    screen.getByRole('textbox', { name: SEARCH_LABEL }).focus()

    for (const name of ['Status', 'Priority', 'Sort by']) {
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name }))
    }
  })
})

// ---------------------------------------------------------------------------
// AC2 — the kanban snaps one column per swipe, with a visible edge fade
// ---------------------------------------------------------------------------

describe('ProjectDetailPage kanban scroller', () => {
  it('fades its edges instead of merely hiding the scrollbar', async () => {
    await renderBoardTab()

    const scroller = boardScroller()

    expect(
      tokens(scroller),
      'the board must use the .scroll-fade-x mask (24px transparent edges) added in T02'
    ).toContain('scroll-fade-x')
    expect(
      tokens(scroller),
      'scroll-hidden only removes the scrollbar, leaving no affordance that the board continues ' +
        'past the right edge'
    ).not.toContain('scroll-hidden')
  })

  it('snaps to one column per swipe', async () => {
    await renderBoardTab()

    const scroller = boardScroller()

    expect(tokens(scroller), 'the board still scrolls sideways').toContain('overflow-x-auto')
    expect(tokens(scroller), 'snapping is on the horizontal axis').toContain('snap-x')
    expect(
      tokens(scroller),
      'a swipe must land on exactly one column, never between two'
    ).toContain('snap-mandatory')
  })

  it.each(COLUMNS.map(({ name, card }) => [name, card] as const))(
    'makes the "%s" column a snap target',
    async (name, card) => {
    // Two separate sites render columns — the project statuses and the
    // "Unlisted statuses" section — and snapping only one of them leaves the
    // board free-scrolling as soon as a task holds a delisted status.
    await renderBoardTab()

    const column = boardColumn(card)

    expect(
      tokens(column).filter((token) => SNAP_ALIGNMENTS.includes(token)),
      `the "${name}" column must declare where a swipe lands (one of ${SNAP_ALIGNMENTS.join(', ')})`
    ).not.toEqual([])
    expect(
      tokens(column),
      `the "${name}" column must keep its fixed width, or snapping has nothing to snap to`
    ).toContain('shrink-0')
    }
  )

  it('keeps the board the only sideways-scrolling surface on the page body', async () => {
    // AC3: the kanban is allowed to scroll horizontally because it is its own
    // scroll container; the toolbars above it are not, so they must never
    // acquire one as a way of hiding their overflow.
    await renderBoardTab()

    expect(tokens(boardToolbarWithCount())).not.toContain('overflow-x-auto')
    expect(tokens(boardToolbarWithCount())).not.toContain('overflow-x-scroll')
  })
})

// ---------------------------------------------------------------------------
// Source-level guard — the replaced utility is gone from the page entirely
// ---------------------------------------------------------------------------

describe('ProjectDetailPage source (T13c)', () => {
  it('no longer references the scroll-hidden utility', () => {
    // Class-token assertions can only see the element the test found; this
    // proves the swap was not made by adding scroll-fade-x beside the old
    // class, or by leaving a second copy of the utility on another wrapper.
    const source = readFileSync(PAGE_SOURCE_PATH, 'utf-8')

    expect(
      source.includes('scroll-hidden'),
      'ProjectDetailPage.tsx still uses "scroll-hidden" on the board scroller. T13c replaces it ' +
        'with scroll-fade-x, which fades the edges instead of silently removing the only hint ' +
        'that the board continues off-screen.'
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Global constraint 4 — the desktop shell (≥1024px) is unchanged
//
// T09 learned that adding flex-wrap DID change the ≥1024px ProjectsPage
// toolbar, so both 1024px (the exact shell boundary) and 1280px are covered.
// ---------------------------------------------------------------------------

describe.each([1024, 1280])('ProjectDetailPage at %ipx', (width) => {
  it('keeps the board toolbar’s desktop spacing, alignment and rule', async () => {
    await renderBoardTab(width)

    const toolbar = boardToolbarWithCount()

    expect(tokens(toolbar)).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'gap-2', 'py-2.5', 'border-b'])
    )
    expect(
      tokens(toolbar),
      'from md up the toolbar keeps its original 28px gutter, so the desktop row is unmoved'
    ).toContain('md:px-7')
  })

  it('keeps the stories toolbar’s desktop spacing and alignment', async () => {
    await renderStoriesTab(width)

    const toolbar = storiesToolbar()

    expect(tokens(toolbar)).toEqual(expect.arrayContaining(['flex', 'items-center', 'gap-2', 'mb-4']))
    expect(tokens(horizontalPaddingOwner(toolbar))).toContain('md:px-7')
  })

  it('keeps the board surface, its column width and its column gap', async () => {
    await renderBoardTab(width)

    expect(tokens(boardScroller())).toEqual(
      expect.arrayContaining(['flex-1', 'overflow-x-auto', 'bg-stone-50', 'fine-grid'])
    )
    expect(tokens(boardTrack())).toEqual(expect.arrayContaining(['flex', 'gap-3', 'min-w-min']))
    for (const { name, card } of COLUMNS) {
      expect(tokens(boardColumn(card)), `the "${name}" column keeps its 272px width`).toContain(
        'w-[272px]'
      )
    }
  })

  it('renders the same board markup as a phone does, with no JS width branch', async () => {
    // Layout is expressed with CSS variants only (global constraint 2): the
    // rendered tree must not depend on a media query.
    const phone = await renderBoardTab(375)
    const phoneHtml = normaliseIds(boardScroller().outerHTML)
    const phoneToolbarHtml = normaliseIds(boardToolbarWithCount().outerHTML)
    phone.unmount()

    await renderBoardTab(width)

    expect(normaliseIds(boardScroller().outerHTML)).toBe(phoneHtml)
    expect(normaliseIds(boardToolbarWithCount().outerHTML)).toBe(phoneToolbarHtml)
  })

  it('renders the same stories toolbar markup as a phone does, with no JS width branch', async () => {
    const phone = await renderStoriesTab(375)
    const phoneHtml = normaliseIds(storiesToolbar().outerHTML)
    phone.unmount()

    await renderStoriesTab(width)

    expect(normaliseIds(storiesToolbar().outerHTML)).toBe(phoneHtml)
  })
})

// ---------------------------------------------------------------------------
// The utility the board is moving to must exist and still do the fade.
// ---------------------------------------------------------------------------

describe('the scroll-fade-x utility the board adopts', () => {
  it('masks 24px of each horizontal edge', () => {
    const css = readFileSync(path.join(__dirname, '..', 'index.css'), 'utf-8')
    const rule = css.match(/\.scroll-fade-x\s*\{([^}]*)\}/)

    expect(rule, 'src/index.css must still declare .scroll-fade-x (added in T02)').not.toBeNull()
    expect(
      /mask-image:\s*linear-gradient\(to right,\s*transparent,\s*black 24px/.test(rule?.[1] ?? ''),
      'the board’s edge fade comes from this rule; without the gradient the class is inert and ' +
        'the kanban shows no hint that it continues off-screen'
    ).toBe(true)
  })
})

// The stories *table rows* (T14) and the four overlays (T13b) are deliberately
// untested here, as are live drags (not verifiable in this environment).
