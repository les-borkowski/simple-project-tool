import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { makeProject, makeProjectStatus, makeStory, makeTask, makeUser } from '../test/factories'
import { StoryDetailPage } from './StoryDetailPage'
import type { MemberResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T20 AC2 — hand-reviewed site: StoryDetailPage's member-initials avatar.
//
// StoryDetailPage.tsx:388 sizes the initials text with the ad-hoc
// text-[9px], inside a w-5 h-5 (20px) circle. The scale has no 9px step, so
// the codemod rounds it up to text-ui-2xs (10px) — a 1px grow, one of the
// two sites the AC calls out for a human look rather than a mechanical
// <=0.5px move.
//
// Co-located next to StoryDetailPage.detailRail.test.tsx but kept in its own
// file rather than extended into it: that file's stubApi() always resolves
// tasksApi.list to an empty list (deliberately, per its own T11 focus), and
// duplicating its whole mock/render scaffold here to override just the task
// list keeps this ticket's concern isolated and its intent grep-able by
// filename.
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

const STORY = makeStory({ id: 'story-1', project_id: 'proj-1', title: 'Login flow' })
const PROJECT = makeProject({ id: 'proj-1', name: 'Apollo' })
const STATUSES = [
  makeProjectStatus({ project_id: 'proj-1', slug: 'todo', name: 'To Do', order: 0 }),
  makeProjectStatus({ project_id: 'proj-1', slug: 'done', name: 'Done', order: 1 }),
]

function tokensOf(element: Element): string[] {
  return Array.from(element.classList)
}

async function renderPageWithAssignedTask() {
  const manager = makeUser({ role: 'manager', name: 'Ada Lovelace' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }
  const task = makeTask({
    id: 'task-1',
    project_id: 'proj-1',
    story_id: 'story-1',
    title: 'Wire up the login form',
    assignee_id: manager.id,
  })

  vi.mocked(storiesApi.get).mockResolvedValue({ data: STORY } as never)
  vi.mocked(storiesApi.update).mockResolvedValue({ data: STORY } as never)
  vi.mocked(projectsApi.get).mockResolvedValue({ data: PROJECT } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(statusesApi.list).mockResolvedValue({ data: STATUSES } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [task], next_cursor: null } } as never)
  vi.mocked(commentsApi.listForStory).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
  vi.mocked(timeTrackingApi.historyForStory).mockResolvedValue({ data: [] } as never)

  const view = renderWithProviders(<StoryDetailPage />, {
    path: '/projects/:projectId/stories/:storyId',
    route: '/projects/proj-1/stories/story-1',
    auth: { user: manager, isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: 'Login flow' })
  await screen.findByText('Wire up the login form')
  return view
}

describe('StoryDetailPage member-initials avatar (T20 AC2 hand-reviewed site)', () => {
  it('sizes the initials with the text-ui-2xs scale step, not the ad-hoc text-[9px]', async () => {
    await renderPageWithAssignedTask()

    const avatar = await screen.findByTitle('Ada Lovelace')

    expect(tokensOf(avatar)).toContain('text-ui-2xs')
    expect(tokensOf(avatar)).not.toContain('text-[9px]')
  })
})
