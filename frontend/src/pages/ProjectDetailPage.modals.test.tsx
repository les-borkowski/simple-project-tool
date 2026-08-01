import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeProjectStatus, makeStory, makeUser } from '../test/factories'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, StoryResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T13b — the three inline overlays on ProjectDetailPage move to <Modal>.
//
// Scope is sub-ticket (b) only: the create-story, invite and edit-story
// overlays (CreateTaskModal has its own file). Nothing here touches the
// header/tabs (T13a), the toolbars or the board (T13c), or the stories table
// (T14).
//
// "It renders <Modal>" is a component boundary, i.e. an internal, so it is
// asserted only through what a user can observe: dialog semantics with an
// accessible name, a portal on document.body, Escape and backdrop dismissal
// (including the guard against a drag that starts inside the panel), focus
// moving in and coming back out, the body scroll lock, and the submit path
// still reaching the API.
//
// jsdom computes no layout (getBoundingClientRect is all zeros, vitest.config
// sets css: false), so every width/responsive claim below is a class-token
// assertion read off classList — never a measurement.
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
      create: vi.fn(),
      update: vi.fn(),
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
    invitationsApi: {
      ...actual.invitationsApi,
      create: vi.fn(),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      get: vi.fn(),
      update: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
})

import {
  invitationsApi,
  preferencesApi,
  projectsApi,
  statusesApi,
  storiesApi,
} from '../services/api'

const CREATE_STORY_TITLE = 'New story'
const INVITE_TITLE = 'Invite member'
const EDIT_STORY_TITLE = 'Edit'

function primeApi(stories: StoryResponse[]) {
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
    data: { items: stories, next_cursor: null },
  } as never)
  vi.mocked(storiesApi.create).mockResolvedValue({ data: makeStory() } as never)
  vi.mocked(storiesApi.update).mockResolvedValue({ data: stories[0] ?? makeStory() } as never)
  vi.mocked(invitationsApi.create).mockResolvedValue({ data: {} } as never)
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

async function renderLoadedPage(stories: StoryResponse[] = []) {
  const { manager, project } = primeApi(stories)

  const view = renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1',
    auth: { user: manager, isAuthenticated: true },
  })

  await screen.findByRole('heading', { level: 1, name: project.name })
  return { ...view, manager, project }
}

/** The "New" split button in the header, which owns Story and Task. */
function newMenuTrigger(): HTMLElement {
  return screen.getByRole('button', { name: 'New' })
}

async function openCreateStory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(newMenuTrigger())
  await user.click(await screen.findByRole('button', { name: 'Story' }))
  // Waits on the overlay's own heading rather than the dialog role, so the
  // behavioural tests below fail on the behaviour they are named for instead
  // of all collapsing into "there is no dialog".
  await screen.findByRole('heading', { name: CREATE_STORY_TITLE })
}

async function openInvite(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Invite' }))
  await screen.findByRole('heading', { name: INVITE_TITLE })
}

async function openEditStory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Stories' }))
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  await screen.findByRole('heading', { name: EDIT_STORY_TITLE })
}

/** The full-screen backdrop Modal renders around its panel. */
function backdropOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement
}

/**
 * The ancestor of `element` that carries a two-column grid utility, in
 * whichever form. Used to prove the column split is now gated behind `sm:`.
 */
function gridHostOf(element: HTMLElement): HTMLElement | null {
  return element.closest('[class~="grid-cols-2"], [class~="sm:grid-cols-2"]')
}

// ---------------------------------------------------------------------------
// Create story
// ---------------------------------------------------------------------------

describe('ProjectDetailPage create-story overlay', () => {
  it('opens as a modal dialog named after its title', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = document.getElementById(labelledBy as string) as HTMLElement
    expect(title).toHaveTextContent(CREATE_STORY_TITLE)
    expect(title.tagName).toBe('H2')
  })

  it('renders through a portal on document.body', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    expect(backdropOf(dialog).parentElement).toBe(document.body)
  })

  it('drops the phone-hostile min-w-[67vw] and caps its width at the lg size instead', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    expect(backdropOf(dialog).outerHTML).not.toContain('min-w-[67vw]')
    // lg = max-w-3xl (768px), the closest Modal size to the old
    // w-[min(90vw,_900px)] cap.
    expect(dialog.classList.contains('max-w-3xl')).toBe(true)
    expect(dialog.classList.contains('w-full')).toBe(true)
  })

  it('stacks the status and priority fields on a phone and splits them from sm up', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    const grid = gridHostOf(within(dialog).getByLabelText('Status'))

    expect(grid, 'the status/priority pair sits in a two-column grid').not.toBeNull()
    expect((grid as HTMLElement).classList.contains('sm:grid-cols-2')).toBe(true)
    expect((grid as HTMLElement).classList.contains('grid-cols-2')).toBe(false)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('clears the story form when Escape closes it, so reopening starts blank', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    await user.type(within(dialog).getByPlaceholderText('Title'), 'Abandoned story')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: CREATE_STORY_TITLE })).not.toBeInTheDocument()
    })

    await openCreateStory(user)
    const reopened = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    expect(within(reopened).getByPlaceholderText('Title')).toHaveValue('')
  })

  it('leaves the overlay open when Escape dismisses a second overlay stacked on top', async () => {
    const user = userEvent.setup()
    const { manager, project } = primeApi([])

    // A second overlay opened after the story overlay. Only the topmost may
    // react to Escape; a private document listener inside the page would fire
    // regardless of what is stacked above it.
    function StackHarness() {
      const [stacked, setStacked] = useState(false)
      return (
        <>
          <ProjectDetailPage />
          <button type="button" onClick={() => setStacked(true)}>
            Stack an overlay
          </button>
          {stacked && (
            <ConfirmDialog
              title="Stacked overlay"
              onConfirm={() => setStacked(false)}
              onCancel={() => setStacked(false)}
            />
          )}
        </>
      )
    }

    renderWithProviders(<StackHarness />, {
      path: '/projects/:id',
      route: '/projects/proj-1',
      auth: { user: manager, isAuthenticated: true },
    })
    await screen.findByRole('heading', { level: 1, name: project.name })

    await openCreateStory(user)
    await user.click(screen.getByRole('button', { name: 'Stack an overlay' }))
    await screen.findByText('Stacked overlay')

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('Stacked overlay')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: CREATE_STORY_TITLE })).toBeInTheDocument()
  })

  it('closes when the backdrop is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    fireEvent.mouseDown(backdropOf(screen.getByRole('dialog', { name: CREATE_STORY_TITLE })))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: CREATE_STORY_TITLE })).not.toBeInTheDocument()
    })
  })

  it('stays open when a press starts inside the panel and ends on the backdrop', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    // A text selection drag: mousedown lands on the panel and bubbles out to
    // the backdrop, which must not treat it as a dismissal.
    fireEvent.mouseDown(dialog)

    expect(screen.getByRole('heading', { name: CREATE_STORY_TITLE })).toBeInTheDocument()
  })

  it('moves focus into the dialog when it opens and back to the New button when it closes', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(newMenuTrigger())
    })
  })

  it('keeps Tab inside the dialog instead of reaching the page behind it', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })

    await user.tab()
    await user.tab()

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('locks body scroll while open and unlocks it once closed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    expect(document.body.style.overflow).not.toBe('hidden')

    await openCreateStory(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('still creates the story with the typed values when the footer Create button is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    await user.type(within(dialog).getByPlaceholderText('Title'), 'Login flow')
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'high')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(storiesApi.create).toHaveBeenCalledWith('proj-1', {
        title: 'Login flow',
        description: undefined,
        status: 'to_do',
        priority: 'high',
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: CREATE_STORY_TITLE })).not.toBeInTheDocument()
    })
  })

  it('submits from the keyboard when Enter is pressed in the title field', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openCreateStory(user)

    const dialog = screen.getByRole('dialog', { name: CREATE_STORY_TITLE })
    await user.type(within(dialog).getByPlaceholderText('Title'), 'Login flow{Enter}')

    await waitFor(() => {
      expect(storiesApi.create).toHaveBeenCalledTimes(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Invite member
// ---------------------------------------------------------------------------

describe('ProjectDetailPage invite overlay', () => {
  it('opens as a portalled modal dialog named after its title', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(backdropOf(dialog).parentElement).toBe(document.body)

    const title = document.getElementById(dialog.getAttribute('aria-labelledby') as string)
    expect(title?.tagName).toBe('H2')
  })

  it('caps its width at the md size and never applies min-w-[67vw]', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    // md = max-w-lg, the closest Modal size to the old `max-w-md w-full`.
    expect(dialog.classList.contains('max-w-lg')).toBe(true)
    expect(backdropOf(dialog).outerHTML).not.toContain('min-w-[67vw]')
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('closes when the backdrop is pressed but not when the press starts in the panel', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('heading', { name: INVITE_TITLE })).toBeInTheDocument()

    fireEvent.mouseDown(backdropOf(dialog))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: INVITE_TITLE })).not.toBeInTheDocument()
    })
  })

  it('moves focus into the dialog on open and back to the Invite button on close', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite' }))
    })
  })

  it('locks body scroll while open and unlocks it once closed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openInvite(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('still sends the invitation with the typed email and chosen role', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()
    await openInvite(user)

    const dialog = screen.getByRole('dialog', { name: INVITE_TITLE })
    await user.type(within(dialog).getByPlaceholderText('Email address'), 'ada@example.com')
    await user.selectOptions(within(dialog).getByRole('combobox'), 'manager')
    await user.click(within(dialog).getByRole('button', { name: 'Invite member' }))

    await waitFor(() => {
      expect(invitationsApi.create).toHaveBeenCalledWith('proj-1', {
        invitee_email: 'ada@example.com',
        role: 'manager',
      })
    })
  })
})

// ---------------------------------------------------------------------------
// Edit story
// ---------------------------------------------------------------------------

describe('ProjectDetailPage edit-story overlay', () => {
  const story = makeStory({ id: 'story-1', title: 'Login flow', description: 'Original' })

  it('opens as a portalled modal dialog named after its title', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(backdropOf(dialog).parentElement).toBe(document.body)

    const title = document.getElementById(dialog.getAttribute('aria-labelledby') as string)
    expect(title?.tagName).toBe('H2')
  })

  it('caps its width at the md size and never applies min-w-[67vw]', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    expect(dialog.classList.contains('max-w-lg')).toBe(true)
    expect(backdropOf(dialog).outerHTML).not.toContain('min-w-[67vw]')
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('closes when the backdrop is pressed but not when the press starts in the panel', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog', { name: EDIT_STORY_TITLE })).toBeInTheDocument()

    fireEvent.mouseDown(backdropOf(dialog))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: EDIT_STORY_TITLE })).not.toBeInTheDocument()
    })
  })

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('locks body scroll while open and unlocks it once closed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])

    await openEditStory(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('still saves the edited title when the footer Save button is pressed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage([story])
    await openEditStory(user)

    const dialog = screen.getByRole('dialog', { name: EDIT_STORY_TITLE })
    const titleField = within(dialog).getByDisplayValue('Login flow')
    await user.clear(titleField)
    await user.type(titleField, 'Login flow v2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(storiesApi.update).toHaveBeenCalledWith('story-1', {
        title: 'Login flow v2',
        description: 'Original',
      })
    })
  })
})
