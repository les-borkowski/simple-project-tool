import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeProjectStatus, makeStory, makeTask, makeUser } from '../test/factories'
import { expectTapSafeControl } from '../test/tapSafeRecipe'
import { StoryDetailPage } from './StoryDetailPage'
import type { MemberResponse } from '../services/api'

// ---------------------------------------------------------------------------
// Defect I3 (final whole-branch review) — StoryDetailPage's edit-task overlay
// was never migrated to <Modal> (StoryDetailPage.tsx:434-457). It is still a
// hand-rolled `fixed inset-0` panel: no role="dialog", no aria-modal, no
// focus trap, no Escape handler, no body scroll lock, no portal, no
// max-height/scroller, and its footer buttons carry no tap-safe.
//
// This file mirrors ProjectDetailPage.modals.test.tsx's "edit-story overlay"
// describe block (the established pattern for T13b) one-for-one, applied to
// the task-edit overlay here. It also reuses the shared tap-safe recipe
// (src/test/tapSafeRecipe.ts) rather than re-deriving that assertion.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    storiesApi: { ...actual.storiesApi, get: vi.fn(), update: vi.fn() },
    projectsApi: { ...actual.projectsApi, get: vi.fn(), listMembers: vi.fn() },
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
    tasksApi: { ...actual.tasksApi, list: vi.fn(), update: vi.fn() },
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
const TASK = makeTask({
  id: 'task-1',
  project_id: 'proj-1',
  story_id: 'story-1',
  title: 'Wire the form',
  description: 'Original description',
})

const EDIT_TASK_TITLE = 'Edit'

function stubApi() {
  const manager = makeUser({ role: 'manager' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(storiesApi.get).mockResolvedValue({ data: STORY } as never)
  vi.mocked(storiesApi.update).mockResolvedValue({ data: STORY } as never)
  vi.mocked(projectsApi.get).mockResolvedValue({ data: PROJECT } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(statusesApi.list).mockResolvedValue({ data: STATUSES } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [TASK], next_cursor: null } } as never)
  vi.mocked(tasksApi.update).mockResolvedValue({ data: TASK } as never)
  vi.mocked(commentsApi.listForStory).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
  vi.mocked(timeTrackingApi.historyForStory).mockResolvedValue({ data: [] } as never)

  return manager
}

async function renderLoadedPage() {
  const manager = stubApi()
  const view = renderWithProviders(<StoryDetailPage />, {
    path: '/projects/:projectId/stories/:storyId',
    route: '/projects/proj-1/stories/story-1',
    auth: { user: manager, isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: 'Login flow' })
  await screen.findByText('Wire the form')
  return view
}

async function openEditTask(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: EDIT_TASK_TITLE }))
}

/** The full-screen backdrop a portalled Modal renders around its panel. */
function backdropOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement
}

describe('StoryDetailPage edit-task overlay (defect I3)', () => {
  it('opens as a dialog with an accessible name, so assistive tech knows what it is', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders through a portal on document.body, like every other overlay in the app', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    expect(backdropOf(dialog).parentElement).toBe(document.body)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('traps focus inside the dialog while open, keeping Tab off the page behind it', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    // Tab all the way around the dialog's focusable elements and back — focus
    // must never land outside it.
    for (let i = 0; i < 10; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('returns focus to the trigger once the dialog closes', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    const trigger = screen.getByRole('button', { name: EDIT_TASK_TITLE })
    await openEditTask(user)

    // Focus must actually have moved into the dialog first — otherwise
    // "focus is on the trigger after Escape" would pass vacuously for a
    // dialog that never took focus (and never handles Escape) in the first
    // place.
    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('locks body scroll while open and restores it once closed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openEditTask(user)
    await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('carries tap-safe on both footer buttons', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    expectTapSafeControl(within(dialog).getByRole('button', { name: 'Cancel' }), 'edit-task Cancel button')
    expectTapSafeControl(within(dialog).getByRole('button', { name: 'Save' }), 'edit-task Save button')
  })

  it('still saves the edited title when the footer Save button is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    const titleField = within(dialog).getByDisplayValue('Wire the form')
    await user.clear(titleField)
    await user.type(titleField, 'Wire the form v2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(tasksApi.update).toHaveBeenCalledWith('task-1', {
        title: 'Wire the form v2',
        description: 'Original description',
      })
    })
  })

  it('closes when the backdrop is pressed but not when the press starts inside the panel', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openEditTask(user)

    const dialog = await screen.findByRole('dialog', { name: EDIT_TASK_TITLE })
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog', { name: EDIT_TASK_TITLE })).toBeInTheDocument()

    fireEvent.mouseDown(backdropOf(dialog))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: EDIT_TASK_TITLE })).not.toBeInTheDocument()
    })
  })
})
