import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, within } from '../test/render'
import { makeProject, makeStory, makeTask, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, StoryResponse, TaskResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T14 — Stories table responsive rows.
//
// jsdom computes no layout (vitest.config.ts sets `css: false`, and
// getBoundingClientRect() is all zeros), so "the title sits on one line",
// "status/priority/count/updated wrap beneath it" and "this fits a 375px
// screen" are NOT measurable here. Everything below is expressed as a
// class-token / DOM-structure assertion:
//   - AC2 (desktop grid unchanged) is pinned by asserting the exact
//     grid-cols-[1fr_120px_100px_100px_80px] track list still appears in the
//     className of all three grid sites (header row, story row, task row),
//     optionally md:-prefixed, and that the element is still `display: grid`
//     at md+ (bare `grid` or `md:grid`).
//   - AC1/AC4 (mobile wrapping) is pinned by asserting status/priority/
//     count/updated share ONE wrapper element, distinct from the title, and
//     that wrapper carries `md:contents` (vanishes at md, so its children
//     rejoin the grid columns) plus a flex-wrap utility (so they wrap on
//     narrow screens). This is the one-markup-tree technique the ticket
//     mandates instead of two conditional renders.
//   - AC3 (drag still works) is pinned by asserting the existing dnd-kit
//     wiring (drag-row class, role/aria-roledescription/tabindex from
//     useSortable's `attributes`) is still on the same outer div as before.
//     A live drag cannot be exercised in jsdom; that is a browser-pass
//     concern per the ticket's own verification note.
// The real geometry (wrap points, 375px fit, whether a drag actually
// reorders rows on screen) is a browser review, not this file.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      get: vi.fn(),
      listMembers: vi.fn(),
    },
    storiesApi: {
      ...actual.storiesApi,
      list: vi.fn(),
    },
    tasksApi: {
      ...actual.tasksApi,
      list: vi.fn(),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      get: vi.fn().mockRejectedValue(new Error('not needed for this test')),
    },
  }
})

import { projectsApi, storiesApi, tasksApi } from '../services/api'

async function setupStoriesTab(story: StoryResponse, tasks: TaskResponse[]) {
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
  vi.mocked(storiesApi.list).mockResolvedValue({ data: { items: [story], next_cursor: null } } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: tasks, next_cursor: null } } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=stories',
    auth: { user: manager, isAuthenticated: true },
  })

  const storyLink = await screen.findByRole('link', { name: story.title })
  return { storyLink }
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

const TRACK_LIST_TOKEN = /^(?:md:)?grid-cols-\[1fr_120px_100px_100px_80px\]$/
const GRID_DISPLAY_TOKEN = /^(?:md:)?grid$/

/**
 * Walks up from `from` to the nearest ancestor (inclusive) whose className
 * still carries today's exact five-column track list, bare or md:-prefixed.
 * Works for all three grid sites named in the ticket: the header row, the
 * story row (grid classes on a wrapping <div>) and the task row (grid
 * classes directly on the <Link>).
 */
function closestGridRow(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from
  while (node) {
    if (tokens(node).some((t) => TRACK_LIST_TOKEN.test(t))) return node
    node = node.parentElement
  }
  throw new Error(
    'No ancestor of the given element carries grid-cols-[1fr_120px_100px_100px_80px] ' +
      '(bare or md:-prefixed). AC2 requires this exact track list to survive on all three grid sites.'
  )
}

function expectDesktopTrackListSurvives(row: HTMLElement, what: string) {
  const toks = tokens(row)
  expect(
    toks.some((t) => TRACK_LIST_TOKEN.test(t)),
    `${what}: expected className to still contain grid-cols-[1fr_120px_100px_100px_80px], bare or ` +
      `md:-prefixed. Got: "${row.className}". Deleting the desktop track list breaks AC2 (the md+ ` +
      'grid must render byte-identical to today\'s).'
  ).toBe(true)
  expect(
    toks.some((t) => GRID_DISPLAY_TOKEN.test(t)),
    `${what}: expected the element to still be display:grid at md+ (a bare "grid" class, or an ` +
      `"md:grid" class). Got: "${row.className}".`
  ).toBe(true)
}

// ---------------------------------------------------------------------------
// AC2 / constraint 4 — the desktop track list survives on all three grid
// sites: the column-header row, the story row and the task sub-row.
// ---------------------------------------------------------------------------

describe('T14 stories table: desktop grid track list survives (AC2)', () => {
  it('keeps the exact track list on the column-header row', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Header row story' })
    await setupStoriesTab(story, [])

    // "Title" also appears as a <option> in the "Sort by" select, so scope to
    // the <span> the column-header row actually renders.
    const titleHeading = screen.getByText('Title', { selector: 'span' })
    const headerRow = closestGridRow(titleHeading)

    expectDesktopTrackListSurvives(headerRow, 'the stories column-header row')
  })

  it('keeps the exact track list on a story row', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const { storyLink } = await setupStoriesTab(story, [])

    const storyRow = closestGridRow(storyLink)

    expectDesktopTrackListSurvives(storyRow, 'a story row')
  })

  it('keeps the exact track list on a task sub-row', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const task = makeTask({ id: 'task-1', story_id: story.id, title: 'Wire the form' })
    await setupStoriesTab(story, [task])

    // The task row's accessible name is the whole row's concatenated text
    // (title, status, priority, updated all sit inside one <a>), so an exact
    // string match against just the title fails; match a distinctive substring.
    const taskLink = await screen.findByRole('link', { name: /wire the form/i })
    const taskRow = closestGridRow(taskLink)

    expectDesktopTrackListSurvives(taskRow, 'a task sub-row')
  })
})

// ---------------------------------------------------------------------------
// AC1 / AC4 — status/priority/count/updated share one wrapper, distinct from
// the title, carrying md:contents (so it vanishes at md and its children
// rejoin the grid) plus a flex-wrap utility (so they wrap on a phone).
// ---------------------------------------------------------------------------

describe('T14 stories table: mobile wrapper for status/priority/count/updated (AC1)', () => {
  it('wraps a story row\'s status, priority, count and updated cells in one md:contents flex-wrap element, apart from the title', async () => {
    const story = makeStory({
      id: 'story-1',
      project_id: 'proj-1',
      title: 'Login flow',
      status: 'todo',
      priority: 'high',
    })
    const tasks = [
      makeTask({ id: 'task-1', story_id: story.id, title: 'Task one' }),
      makeTask({ id: 'task-2', story_id: story.id, title: 'Task two' }),
    ]
    const { storyLink } = await setupStoriesTab(story, tasks)
    await screen.findByRole('link', { name: /task one/i })

    const storyRow = closestGridRow(storyLink)
    const statusText = within(storyRow).getByText('todo')
    const priorityText = within(storyRow).getByText('High')
    const countText = within(storyRow).getByText('2')
    const updatedText = within(storyRow).getByText('just now')

    const wrapper = commonAncestor([statusText, priorityText, countText, updatedText])

    expect(
      wrapper,
      'status, priority, count and updated must share a single wrapper element, not sit as four ' +
        'separate grid children'
    ).not.toBe(storyRow)
    expect(
      wrapper.parentElement,
      'the wrapper must be a direct child of the row, alongside the title cell'
    ).toBe(storyRow)
    expect(
      tokens(wrapper),
      'the wrapper must carry md:contents so it disappears at md+ and its children rejoin the grid columns'
    ).toContain('md:contents')
    expect(
      tokens(wrapper),
      'the wrapper must be allowed to wrap its four cells on a narrow screen'
    ).toContain('flex-wrap')

    const titleCell = childContaining(storyRow, storyLink)
    expect(titleCell, 'the title is a direct grid child, not inside the status/priority/count/updated wrapper').not.toBe(wrapper)
    expect(wrapper.contains(storyLink), 'the title link must not be inside the wrapper').toBe(false)
    expect(titleCell.parentElement, 'the title cell must itself be a direct child of the row').toBe(storyRow)

    // The four logical cells are all present, and in their original order.
    const order = [statusText, priorityText, countText, updatedText].map((marker) =>
      Array.from(wrapper.children).findIndex((child) => child.contains(marker))
    )
    expect(order.every((i) => i !== -1), 'every one of status/priority/count/updated must be found inside the wrapper').toBe(true)
    expect(order, 'status, priority, count and updated must stay in their original left-to-right order').toEqual(
      [...order].sort((a, b) => a - b)
    )
  })

  it('gives a task sub-row the same md:contents wrapper technique as the story row', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const task = makeTask({
      id: 'task-1',
      story_id: story.id,
      title: 'Wire the form',
      status: 'in_review',
      priority: 'low',
    })
    await setupStoriesTab(story, [task])

    const taskRow = await screen.findByRole('link', { name: /wire the form/i })
    const statusText = within(taskRow).getByText('in_review')
    const priorityText = within(taskRow).getByText('Low')
    const updatedText = within(taskRow).getByText('just now')

    const wrapper = commonAncestor([statusText, priorityText, updatedText])

    expect(
      wrapper,
      'a task sub-row must wrap status, priority (and count/updated) in one shared element too, ' +
        'not as bare grid siblings'
    ).not.toBe(taskRow)
    expect(wrapper.parentElement, 'the wrapper must be a direct child of the task row').toBe(taskRow)
    expect(tokens(wrapper), 'the task row wrapper must also carry md:contents').toContain('md:contents')
    expect(tokens(wrapper), 'the task row wrapper must also be allowed to wrap').toContain('flex-wrap')

    // Four logical cells live in the wrapper: status, priority, an empty
    // count placeholder (task rows render `<span />` for the count column)
    // and updated — in that order.
    expect(
      wrapper.children.length,
      'the wrapper must hold exactly the four non-title cells (status, priority, count placeholder, updated)'
    ).toBe(4)
    const statusIndex = Array.from(wrapper.children).findIndex((c) => c.contains(statusText))
    const priorityIndex = Array.from(wrapper.children).findIndex((c) => c.contains(priorityText))
    const updatedIndex = Array.from(wrapper.children).findIndex((c) => c.contains(updatedText))
    expect([statusIndex, priorityIndex, updatedIndex], 'status/priority/updated must be found and stay ordered').toEqual(
      [0, 1, 3]
    )

    const titleText = within(taskRow).getByText('Wire the form')
    expect(wrapper.contains(titleText), 'the task title must not be inside the status/priority/count/updated wrapper').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC1 — the story title clamps to one line on phones, but not at md+.
//
// jsdom (`css: false`) cannot measure actual line count or wrapping, so this
// only pins the class tokens: a mobile line-clamp plus a `md:`-scoped escape
// hatch that restores desktop wrapping. The real proof that this renders on
// one line at 375px, and that an unbroken long word gets an ellipsis rather
// than a mid-character clip, is a browser measurement (done for this fix).
// ---------------------------------------------------------------------------

describe('T14 stories table: story title clamps to one line on phones (AC1)', () => {
  it('gives the story title link a mobile line-clamp with a md:-scoped escape hatch', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'A very long story title indeed' })
    const { storyLink } = await setupStoriesTab(story, [])

    const toks = tokens(storyLink)
    expect(toks, 'the title link must clamp to one line by default (mobile)').toContain('line-clamp-1')
    expect(
      toks,
      'the title link must unset the clamp at md+ so desktop wrapping is unchanged'
    ).toContain('md:line-clamp-none')
    expect(
      toks,
      'min-w-0 is required so the flex item can shrink below its min-content width and the clamp can ' +
        'actually take effect on a long unbroken word'
    ).toContain('min-w-0')
  })
})

// ---------------------------------------------------------------------------
// One markup tree, not two conditional renders — a story with N tasks
// renders exactly N task titles, never 2N.
// ---------------------------------------------------------------------------

describe('T14 stories table: one markup tree per task row', () => {
  it('renders exactly one title per task, not a duplicated desktop/mobile tree', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const tasks = [
      makeTask({ id: 'task-1', story_id: story.id, title: 'Alpha task of three' }),
      makeTask({ id: 'task-2', story_id: story.id, title: 'Bravo task of three' }),
      makeTask({ id: 'task-3', story_id: story.id, title: 'Charlie task of three' }),
    ]
    await setupStoriesTab(story, tasks)

    const taskLinks = await screen.findAllByRole('link', { name: /task of three/i })

    expect(
      taskLinks,
      'a two-conditional-render implementation (one tree for desktop, one for mobile) would render ' +
        'each task title twice; the ticket mandates one markup tree with md:contents instead'
    ).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// AC3 — drag wiring survives: the sortable outer div keeps its drag-row
// class and the dnd-kit attributes/listeners useSortable puts there.
// Modelled on ProjectDetailPage.dragHandle.test.tsx (T05).
// ---------------------------------------------------------------------------

describe('T14 stories table: drag wiring survives the responsive rework (AC3)', () => {
  it('keeps the drag-row class and dnd-kit attributes on the task row\'s outer wrapper', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const task = makeTask({ id: 'task-1', story_id: story.id, title: 'Wire the form' })
    await setupStoriesTab(story, [task])

    const taskLink = await screen.findByRole('link', { name: /wire the form/i })
    const dragWrapper = taskLink.parentElement

    expect(
      dragWrapper?.className,
      `expected the drag-listener wrapper around the task row's <Link> to still carry the ` +
        `"drag-row" class after the responsive rework. Got class="${dragWrapper?.className ?? '(none)'}".`
    ).toMatch(/\bdrag-row\b/)

    // dnd-kit's useSortable() spreads `attributes` (role, aria-roledescription,
    // tabIndex) onto this same outer div; the rework must not move them to a
    // different node or drop them.
    expect(dragWrapper).toHaveAttribute('role', 'button')
    expect(dragWrapper).toHaveAttribute('aria-roledescription', 'sortable')
    expect(dragWrapper).toHaveAttribute('tabindex', '0')
  })

  it('still disables native drag-to-navigate on the task row link', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const task = makeTask({ id: 'task-1', story_id: story.id, title: 'Wire the form' })
    await setupStoriesTab(story, [task])

    const taskLink = await screen.findByRole('link', { name: /wire the form/i })
    expect(taskLink).toHaveAttribute('draggable', 'false')
  })
})
