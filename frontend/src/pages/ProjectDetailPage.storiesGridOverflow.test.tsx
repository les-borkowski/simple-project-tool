import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { makeProject, makeStory, makeTask, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, StoryResponse, TaskResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T21 code-review fix 1 — stories-table row actions overflow their fixed
// 80px grid column under (pointer: coarse) at >=768px.
//
// The approved fix is a `.stories-grid` class added to all THREE grid sites
// (the column-header row, the story row and the task sub-row) so a single
// unlayered CSS rule (asserted separately in index.css.test.ts) can widen
// the last column under `@media (pointer: coarse) and (width >= 48rem)`
// without touching the `pointer: fine` desktop grid at all.
//
// jsdom computes no layout (vitest.config.ts sets css: false) and cannot
// evaluate `(pointer: coarse)`, so nothing here can measure the overflow or
// the 44px targets. This file only proves the class-token shape: the
// `stories-grid` class is present on all three sites, and it is additive —
// the original `md:grid-cols-[1fr_120px_100px_100px_80px]` desktop track
// list must survive untouched (constraint 4: pointer:fine stays
// byte-identical).
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

const TRACK_LIST_TOKEN = /^(?:md:)?grid-cols-\[1fr_120px_100px_100px_80px\]$/

/**
 * Walks up from `from` to the nearest ancestor (inclusive) whose className
 * still carries today's exact five-column track list, bare or md:-prefixed.
 * Identical technique to ProjectDetailPage.storiesTable.test.tsx's
 * closestGridRow — the row that must ALSO carry `stories-grid`.
 */
function closestGridRow(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from
  while (node) {
    if (tokens(node).some((t) => TRACK_LIST_TOKEN.test(t))) return node
    node = node.parentElement
  }
  throw new Error(
    'No ancestor of the given element carries grid-cols-[1fr_120px_100px_100px_80px] ' +
      '(bare or md:-prefixed).'
  )
}

describe('T21 review fix 1: stories-grid class on all three grid sites', () => {
  it('adds stories-grid to the column-header row, alongside the untouched desktop track list', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Header row story' })
    await setupStoriesTab(story, [])

    // "Title" also appears as a <option> in the "Sort by" select, so scope to
    // the <span> the column-header row actually renders.
    const titleHeading = screen.getByText('Title', { selector: 'span' })
    const headerRow = closestGridRow(titleHeading)

    expect(
      tokens(headerRow),
      `expected the stories column-header row to carry "stories-grid" so the coarse-pointer >=768px ` +
        `override can widen its last column without touching pointer:fine. Got class="${headerRow.className}".`
    ).toContain('stories-grid')
    expect(
      tokens(headerRow).some((t) => TRACK_LIST_TOKEN.test(t)),
      'the original grid-cols-[1fr_120px_100px_100px_80px] desktop track list must survive untouched'
    ).toBe(true)
  })

  it('adds stories-grid to a story row, alongside the untouched desktop track list', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const { storyLink } = await setupStoriesTab(story, [])

    const storyRow = closestGridRow(storyLink)

    expect(
      tokens(storyRow),
      `expected a story row to carry "stories-grid". Got class="${storyRow.className}".`
    ).toContain('stories-grid')
    expect(
      tokens(storyRow).some((t) => TRACK_LIST_TOKEN.test(t)),
      'the original grid-cols-[1fr_120px_100px_100px_80px] desktop track list must survive untouched'
    ).toBe(true)
  })

  it('adds stories-grid to a task sub-row, alongside the untouched desktop track list', async () => {
    const story = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
    const task = makeTask({ id: 'task-1', story_id: story.id, title: 'Wire the form' })
    await setupStoriesTab(story, [task])

    const taskLink = await screen.findByRole('link', { name: /wire the form/i })
    const taskRow = closestGridRow(taskLink)

    expect(
      tokens(taskRow),
      `expected a task sub-row to carry "stories-grid" so header/story/task rows stay column-aligned. ` +
        `Got class="${taskRow.className}".`
    ).toContain('stories-grid')
    expect(
      tokens(taskRow).some((t) => TRACK_LIST_TOKEN.test(t)),
      'the original grid-cols-[1fr_120px_100px_100px_80px] desktop track list must survive untouched'
    ).toBe(true)
  })
})
