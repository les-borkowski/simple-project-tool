import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeProjectStatus, makeStory, makeTask, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse } from '../services/api'

// T07: Board card status menu (non-drag fallback).
//
// Tapping the board card's status pill must open a menu of the project's
// statuses (reusing the T04 Menu component — the same tap-pill-to-edit idiom
// already used on TaskDetailPage/StoryDetailPage), and choosing one must
// update the task through the *same* call shape `handleBoardDragEnd`'s
// cross-column branch already produces:
//   tasksApi.update(taskId, { status: destStatus })
// We can't assert "same handler" by identity (that's an internal), so we
// assert the observable proxy for it: the API call fired by the tap path is
// byte-for-byte the same shape a drag would have produced.

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
      update: vi.fn(),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn(),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      get: vi.fn().mockRejectedValue(new Error('not needed for this test')),
    },
  }
})

import { projectsApi, storiesApi, tasksApi, statusesApi } from '../services/api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(__dirname, 'ProjectDetailPage.tsx')
function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf-8')
}

function threeStatuses() {
  return [
    makeProjectStatus({ id: 'ps-1', slug: 'to_do', name: 'To Do', order: 0 }),
    makeProjectStatus({ id: 'ps-2', slug: 'in_progress', name: 'In Progress', order: 1 }),
    makeProjectStatus({ id: 'ps-3', slug: 'done', name: 'Done', order: 2 }),
  ]
}

async function setupBoardWithTask() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const story = makeStory({ id: 'story-1', project_id: project.id, title: 'A story' })
  const task = makeTask({ id: 'task-1', story_id: story.id, title: 'A board task', status: 'to_do' })
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
  vi.mocked(statusesApi.list).mockResolvedValue({ data: threeStatuses() } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1',
    auth: { user: manager, isAuthenticated: true },
  })

  const taskLink = await screen.findByRole('link', { name: /a board task/i })
  const card = taskLink.parentElement as HTMLElement
  return { task, card }
}

describe('Board card status menu (T07)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the board card status as a tappable control naming the current status', async () => {
    const { card } = await setupBoardWithTask()

    // Tap-pill-to-edit idiom: the pill is wrapped in a button, not a <select>
    // added to every card.
    expect(within(card).getByRole('button', { name: 'To Do' })).toBeInTheDocument()
    expect(within(card).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('opens a menu of the project statuses when the status pill is tapped', async () => {
    const user = userEvent.setup()
    const { card } = await setupBoardWithTask()

    await user.click(within(card).getByRole('button', { name: 'To Do' }))

    expect(await screen.findByRole('button', { name: 'In Progress' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('is keyboard-operable: focusing the pill and pressing Enter opens the menu', async () => {
    const user = userEvent.setup()
    const { card } = await setupBoardWithTask()

    const pill = within(card).getByRole('button', { name: 'To Do' })
    pill.focus()
    expect(pill).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: 'In Progress' })).toBeInTheDocument()
  })

  it('updates the task status when a menu item is chosen, using the same call shape a drag produces', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { card } = await setupBoardWithTask()

    await user.click(within(card).getByRole('button', { name: 'To Do' }))
    await user.click(await screen.findByRole('button', { name: 'In Progress' }))

    // handleBoardDragEnd's cross-column branch calls exactly:
    //   tasksApi.update(active.id, { status: destStatus })
    // The tap path must produce the identical call shape.
    expect(tasksApi.update).toHaveBeenCalledWith('task-1', { status: 'in_progress' })
  })

  it('reflects the new status on the card immediately (optimistic update)', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { card } = await setupBoardWithTask()

    await user.click(within(card).getByRole('button', { name: 'To Do' }))
    await user.click(await screen.findByRole('button', { name: 'In Progress' }))

    // Changing status moves the card into a different board column (a
    // different React parent), unmounting the originally-captured node — so
    // re-query the card fresh by its task link before asserting on it.
    const movedCard = (await screen.findByRole('link', { name: /a board task/i })).parentElement as HTMLElement
    expect(await within(movedCard).findByRole('button', { name: 'In Progress' })).toBeInTheDocument()
    expect(within(movedCard).queryByRole('button', { name: 'To Do' })).not.toBeInTheDocument()
  })

  it('rolls back the status on the card if the update request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockRejectedValue(new Error('network error'))
    const { card } = await setupBoardWithTask()

    await user.click(within(card).getByRole('button', { name: 'To Do' }))
    await user.click(await screen.findByRole('button', { name: 'In Progress' }))

    // The optimistic move (and the rollback once the request rejects) both
    // relocate the card between board columns, so re-query it fresh by its
    // task link rather than relying on the now-possibly-stale captured node.
    await waitFor(async () => {
      const rolledBackCard = (await screen.findByRole('link', { name: /a board task/i })).parentElement as HTMLElement
      expect(within(rolledBackCard).getByRole('button', { name: 'To Do' })).toBeInTheDocument()
    })
    const rolledBackCard = (await screen.findByRole('link', { name: /a board task/i })).parentElement as HTMLElement
    expect(within(rolledBackCard).queryByRole('button', { name: 'In Progress' })).not.toBeInTheDocument()
  })

  it('is reachable by real Tab navigation, not just direct .focus(), and Enter still opens the menu (T07 review, finding 1)', async () => {
    const user = userEvent.setup()
    const { card } = await setupBoardWithTask()

    const pill = within(card).getByRole('button', { name: 'To Do' })
    // Simulate a real keyboard user: Tab through the page until landing on
    // the pill, rather than jumping to it with .focus() (which bypasses the
    // card's drag-listener wrapper and its own tab stop entirely, and so
    // could not have caught the real-browser bug this test guards against).
    for (let i = 0; i < 25 && document.activeElement !== pill; i++) {
      await user.tab()
    }
    expect(pill).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: 'In Progress' })).toBeInTheDocument()
  })

  it('closes the status menu on Escape and returns focus to the pill (T07 review, finding 2)', async () => {
    const user = userEvent.setup()
    const { card } = await setupBoardWithTask()

    const pill = within(card).getByRole('button', { name: 'To Do' })
    await user.click(pill)
    expect(await screen.findByRole('button', { name: 'In Progress' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'In Progress' })).not.toBeInTheDocument()
    expect(pill).toHaveFocus()
  })

  it('does not navigate the card link when the status pill is tapped', async () => {
    const user = userEvent.setup()
    const { card } = await setupBoardWithTask()

    await user.click(within(card).getByRole('button', { name: 'To Do' }))

    // The board tab must still be showing (no navigation occurred) and the
    // menu must be open, proving the tap on the pill did not fall through to
    // the wrapping <Link>.
    expect(await screen.findByRole('button', { name: 'In Progress' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /a board task/i })).toBeInTheDocument()
  })

  describe('board card is wrapped in the drag-row utility class (carried forward from T05 review)', () => {
    it('carries drag-row on the BoardCard drag-listener wrapper', async () => {
      const { card } = await setupBoardWithTask()

      expect(
        card.className,
        `Expected BoardCard's drag-listener wrapper to carry the "drag-row" class so iOS's ` +
          `link-preview sheet doesn't hijack the long-press. Got class="${card.className || '(none)'}".`,
      ).toMatch(/\bdrag-row\b/)
    })
  })

  describe('drag wiring is unchanged (regression guard — live drag itself is left to a device pass)', () => {
    it('still wires the board DndContext to the shared drag-end handler', () => {
      const source = readSource()
      expect(source).toMatch(/onDragEnd=\{handleBoardDragEnd\}/)
    })

    it('still uses useSortable for board cards', () => {
      expect(readSource()).toMatch(/useSortable\(/)
    })
  })
})
