import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../../test/render'
import { makeProjectStatus, makeStory, makeTask, makeUser } from '../../test/factories'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { CreateTaskModal } from './CreateTaskModal'
import type { MemberResponse } from '../../services/api'

// ---------------------------------------------------------------------------
// T13b (folded in by human decision) — CreateTaskModal moves to <Modal>.
//
// It is the fourth un-migrated overlay reachable from ProjectDetailPage, built
// from the same `fixed inset-0` + `min-w-[67vw]` recipe and carrying its own
// private document-level Escape listener. Everything below is observable
// behaviour: dialog semantics, portal, dismissal, focus, scroll lock, the
// submit path, and the class tokens the ticket names.
//
// jsdom computes no layout, so width and responsive claims are class-token
// assertions only.
// ---------------------------------------------------------------------------

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      listMembers: vi.fn(),
    },
    storiesApi: {
      ...actual.storiesApi,
      list: vi.fn(),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn(),
    },
    sprintsApi: {
      ...actual.sprintsApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    tasksApi: {
      ...actual.tasksApi,
      create: vi.fn(),
    },
  }
})

import { projectsApi, statusesApi, storiesApi, tasksApi } from '../../services/api'

const TITLE = 'New task'
const BACKLOG = makeStory({ id: 'story-1', title: 'Backlog', is_default: true })

const user = () => makeUser({ id: 'user-manager', name: 'Ada Lovelace', role: 'manager' })

function primeApi() {
  const currentUser = user()
  const member: MemberResponse = {
    user_id: currentUser.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: currentUser.name,
    email: currentUser.email,
  }

  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({
    data: { items: [BACKLOG], next_cursor: null },
  } as never)
  vi.mocked(statusesApi.list).mockResolvedValue({
    data: [
      makeProjectStatus({ slug: 'to_do', name: 'To Do', order: 0 }),
      makeProjectStatus({ slug: 'done', name: 'Done', order: 1 }),
    ],
  } as never)
  vi.mocked(tasksApi.create).mockResolvedValue({
    data: makeTask({ id: 'task-1', story_id: 'story-1', title: 'Wire up login' }),
  } as never)

  return { currentUser }
}

interface HarnessOptions {
  onCreated?: (task: unknown) => void
  onClose?: () => void
  /** Renders a second overlay on top, opened after this one. */
  stackable?: boolean
}

/**
 * Mounts the modal from a trigger in a later commit than the one that focused
 * that trigger — the ordering the focus trap needs for its restore target to
 * mean anything (see useFocusTrap.test.tsx).
 */
function Harness({ onCreated = vi.fn(), onClose = vi.fn(), stackable = false }: HarnessOptions) {
  const [open, setOpen] = useState(false)
  const [stacked, setStacked] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        New task trigger
      </button>
      <button type="button">Background button</button>
      {stackable && (
        <button
          type="button"
          onClick={() => {
            setStacked(true)
          }}
        >
          Stack an overlay
        </button>
      )}
      {open && (
        <CreateTaskModal
          projectId="proj-1"
          onCreated={onCreated}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      )}
      {stacked && (
        <ConfirmDialog
          title="Stacked overlay"
          onConfirm={() => setStacked(false)}
          onCancel={() => setStacked(false)}
        />
      )}
    </div>
  )
}

async function openModal(
  ue: ReturnType<typeof userEvent.setup>,
  options: HarnessOptions = {}
): Promise<void> {
  primeApi()
  renderWithProviders(<Harness {...options} />, {
    auth: { user: user(), isAuthenticated: true },
  })
  await ue.click(screen.getByRole('button', { name: 'New task trigger' }))
  // Waits on the overlay's own heading rather than the dialog role, so each
  // test below fails on the behaviour it is named for.
  await screen.findByRole('heading', { name: TITLE })
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: TITLE })
}

function backdropOf(panel: HTMLElement): HTMLElement {
  return panel.parentElement as HTMLElement
}

describe('CreateTaskModal', () => {
  it('opens as a modal dialog named after its title', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const panel = dialog()
    expect(panel).toHaveAttribute('aria-modal', 'true')

    const title = document.getElementById(panel.getAttribute('aria-labelledby') as string)
    expect(title).toHaveTextContent(TITLE)
    expect(title?.tagName).toBe('H2')
  })

  it('renders through a portal on document.body', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    expect(backdropOf(dialog()).parentElement).toBe(document.body)
  })

  it('drops the phone-hostile min-w-[67vw] and caps its width at the lg size instead', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const panel = dialog()
    expect(backdropOf(panel).outerHTML).not.toContain('min-w-[67vw]')
    // lg = max-w-3xl (768px), the closest Modal size to the old
    // w-[min(90vw,_900px)] cap.
    expect(panel.classList.contains('max-w-3xl')).toBe(true)
    expect(panel.classList.contains('w-full')).toBe(true)
  })

  it('stacks its field pairs on a phone and splits them into two columns from sm up', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const grid = within(dialog())
      .getByLabelText('Status')
      .closest('[class~="grid-cols-2"], [class~="sm:grid-cols-2"]')

    expect(grid, 'the field pairs sit in a two-column grid').not.toBeNull()
    expect((grid as HTMLElement).classList.contains('sm:grid-cols-2')).toBe(true)
    expect((grid as HTMLElement).classList.contains('grid-cols-2')).toBe(false)
  })

  it('closes when Escape is pressed', async () => {
    const ue = userEvent.setup()
    const onClose = vi.fn()
    await openModal(ue, { onClose })

    const panel = dialog()
    await ue.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(panel).not.toBeInTheDocument()
    })
  })

  it('stays open when Escape dismisses a second overlay stacked on top', async () => {
    const ue = userEvent.setup()
    const onClose = vi.fn()
    await openModal(ue, { onClose, stackable: true })

    await ue.click(screen.getByRole('button', { name: 'Stack an overlay' }))
    await screen.findByText('Stacked overlay')

    await ue.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText('Stacked overlay')).not.toBeInTheDocument()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
  })

  it('closes when the backdrop is pressed', async () => {
    const ue = userEvent.setup()
    const onClose = vi.fn()
    await openModal(ue, { onClose })

    fireEvent.mouseDown(backdropOf(dialog()))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when a press starts inside the panel and ends on the backdrop', async () => {
    const ue = userEvent.setup()
    const onClose = vi.fn()
    await openModal(ue, { onClose })

    fireEvent.mouseDown(dialog())

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
  })

  it('moves focus into the dialog when it opens and back to the trigger when it closes', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const panel = dialog()
    await waitFor(() => {
      expect(panel.contains(document.activeElement)).toBe(true)
    })

    await ue.click(within(panel).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New task trigger' }))
    })
  })

  it('keeps Tab inside the dialog instead of reaching the page behind it', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const panel = dialog()
    await ue.tab()

    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Background button' }))
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('locks body scroll while open and unlocks it once closed', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    expect(document.body.style.overflow).toBe('hidden')

    await ue.click(within(dialog()).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('still creates the task with the typed values when the footer Create button is pressed', async () => {
    const ue = userEvent.setup()
    const onCreated = vi.fn()
    await openModal(ue, { onCreated })

    const panel = dialog()
    await waitFor(() => {
      expect(within(panel).getByLabelText('Story')).toHaveValue('story-1')
    })

    await ue.type(within(panel).getByPlaceholderText('Title'), 'Wire up login')
    await ue.selectOptions(within(panel).getByLabelText('Priority'), 'high')
    await ue.click(within(panel).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(tasksApi.create).toHaveBeenCalledWith('story-1', {
        title: 'Wire up login',
        description: undefined,
        status: 'to_do',
        priority: 'high',
        assignee_id: 'user-manager',
        sprint_id: null,
        effort: null,
      })
    })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
    })
  })

  it('submits from the keyboard when Enter is pressed in the title field', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    const panel = dialog()
    await waitFor(() => {
      expect(within(panel).getByLabelText('Story')).toHaveValue('story-1')
    })

    await ue.type(within(panel).getByPlaceholderText('Title'), 'Wire up login{Enter}')

    await waitFor(() => {
      expect(tasksApi.create).toHaveBeenCalledTimes(1)
    })
  })

  it('disables the Create button while the request is in flight so it cannot be submitted twice', async () => {
    const ue = userEvent.setup()
    await openModal(ue)

    // Set after openModal: its API priming would otherwise overwrite this with
    // an instantly-resolved create and there would be no in-flight window.
    let resolveCreate: (value: unknown) => void = () => {}
    vi.mocked(tasksApi.create).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve }) as never
    )

    const panel = dialog()
    await waitFor(() => {
      expect(within(panel).getByLabelText('Story')).toHaveValue('story-1')
    })

    await ue.type(within(panel).getByPlaceholderText('Title'), 'Wire up login')
    const create = within(panel).getByRole('button', { name: 'Create' })
    await ue.click(create)

    await waitFor(() => {
      expect(create).toBeDisabled()
    })
    await ue.click(create)
    expect(tasksApi.create).toHaveBeenCalledTimes(1)

    resolveCreate({ data: makeTask({ id: 'task-1' }) })
  })
})
