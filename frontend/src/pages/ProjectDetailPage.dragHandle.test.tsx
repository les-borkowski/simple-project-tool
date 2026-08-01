import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { makeProject, makeStory, makeTask, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse } from '../services/api'

// T05: dnd-kit touch sensors. Story rows in the Stories tab wrap a <Link> in
// dnd-kit's sortable listeners. On iOS, long-pressing that <Link> triggers
// the native link-preview sheet unless the wrapping element opts out via the
// .drag-row utility (-webkit-touch-callout/user-select — NOT touch-action,
// which would disable native scroll panning on the row) AND the <Link>
// itself disables the browser's native drag-to-navigate via
// draggable={false}. Both must hold for the row to be touch-reachable
// without hijacking taps/long-presses.

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

async function setupStoriesTabWithOneTask() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const story = makeStory({ id: 'story-1', project_id: project.id, title: 'A story' })
  const task = makeTask({ id: 'task-1', story_id: story.id, title: 'A task row' })
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
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [task], next_cursor: null } } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=stories',
    auth: { user: manager, isAuthenticated: true },
  })

  const taskLink = await screen.findByRole('link', { name: /a task row/i })
  return { taskLink }
}

describe('Stories tab sortable task row is touch-reachable (T05)', () => {
  it('wraps the task row in an element carrying the drag-row utility class', async () => {
    const { taskLink } = await setupStoriesTabWithOneTask()

    const dragWrapper = taskLink.parentElement
    expect(
      dragWrapper?.className,
      `Expected the drag-listener wrapper around the task row's <Link> to carry the "drag-row" ` +
        `class. Got class="${dragWrapper?.className ?? '(none)'}".`,
    ).toMatch(/\bdrag-row\b/)
  })

  it('sets draggable={false} on the task row <Link> so the browser never starts a native drag on it', async () => {
    const { taskLink } = await setupStoriesTabWithOneTask()

    expect(taskLink).toHaveAttribute('draggable', 'false')
  })
})
