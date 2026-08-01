import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeUser } from '../test/factories'
import { SprintView } from './SprintView'
import type { MemberResponse, SprintResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T16 — SprintView responsive pass.
//
// Scope of this file is the create-sprint overlay only (AC1, AC2, and the
// field-reset regression AC1's migration is most likely to introduce). AC3
// ("sprint columns size to the viewport ... with snap scrolling") is not
// tested here: measuring the live page shows sprints render as a vertical
// `space-y-3` stack of full-width cards with no horizontal-scrolling column
// layout anywhere in the file, so there is nothing for that AC to describe.
// AC4 (no horizontal body scroll at 320px) is already satisfied by the
// current markup and is pinned below as a regression guard, not a RED test.
//
// jsdom computes no layout (getBoundingClientRect is all zeros, vitest.config
// sets css: false), so every width/responsive claim below is a class-token
// assertion read off classList — never a pixel measurement. The 320/375px
// geometry itself is proven by a separate browser pass, per the ticket.
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
    sprintsApi: {
      ...actual.sprintsApi,
      list: vi.fn(),
      create: vi.fn(),
    },
    tasksApi: {
      ...actual.tasksApi,
      listForProject: vi.fn(),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
})

import { projectsApi, sprintsApi, tasksApi } from '../services/api'

const CREATE_TITLE = 'New sprint'

function makeSprint(overrides: Partial<SprintResponse> = {}): SprintResponse {
  return {
    id: 'sprint-1',
    project_id: 'proj-1',
    name: 'Sprint 1',
    start_date: '2026-01-01',
    end_date: '2026-01-14',
    capacity: null,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    total_effort: 0,
    task_count: 0,
    ...overrides,
  }
}

async function renderSprintView(sprints: SprintResponse[] = [makeSprint()]) {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1', effort_unit: null })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(sprintsApi.list).mockResolvedValue({ data: sprints } as never)
  vi.mocked(tasksApi.listForProject).mockResolvedValue({
    data: { items: [], next_cursor: null },
  } as never)

  const view = renderWithProviders(<SprintView projectId="proj-1" />, {
    auth: { user: manager, isAuthenticated: true },
  })

  // Waits for the toolbar's create button to be present, which only happens
  // once useRole has resolved isManager=true.
  await screen.findByRole('button', { name: CREATE_TITLE })
  return { ...view, manager, project }
}

async function openCreateSprint(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: CREATE_TITLE }))
  // Waits on the overlay's own heading rather than the dialog role, so the
  // behavioural tests below fail on the behaviour they are named for instead
  // of all collapsing into "there is no dialog".
  await screen.findByRole('heading', { name: CREATE_TITLE })
}

/** The create-sprint dialog, queried fresh so it reflects the latest render. */
function getDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: CREATE_TITLE })
}

/** Asserts the create-sprint dialog has closed (or never opened). */
function expectDialogClosed() {
  expect(screen.queryByRole('dialog', { name: CREATE_TITLE })).not.toBeInTheDocument()
}

/** The full-screen backdrop Modal renders around its panel. */
function backdropOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement as HTMLElement
}

/**
 * The ancestor of `element` that carries a two-column grid utility, in
 * whichever form. Used to prove the date-field column split is now gated
 * behind `sm:`.
 */
function gridHostOf(element: HTMLElement): HTMLElement | null {
  return element.closest('[class~="grid-cols-2"], [class~="sm:grid-cols-2"]')
}

function fillRequiredFields(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Sprint name'), {
    target: { value: 'Sprint Zeta' },
  })
  fireEvent.change(within(dialog).getByLabelText('Start date'), {
    target: { value: '2026-02-01' },
  })
  fireEvent.change(within(dialog).getByLabelText('End date'), {
    target: { value: '2026-02-14' },
  })
}

// ---------------------------------------------------------------------------
// AC1 — the overlay uses Modal
// ---------------------------------------------------------------------------

describe('SprintView create-sprint overlay (AC1 — uses Modal)', () => {
  it('opens as a modal dialog named after its H2 title, not an h3', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = document.getElementById(labelledBy as string) as HTMLElement
    expect(title).toHaveTextContent(CREATE_TITLE)
    expect(title.tagName).toBe('H2')
  })

  it('renders through a portal on document.body, not inline in the page', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    expect(backdropOf(dialog).parentElement).toBe(document.body)
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('closes when the backdrop is pressed but not when the press starts in the panel', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    fireEvent.mouseDown(dialog)
    expect(getDialog()).toBeInTheDocument()

    fireEvent.mouseDown(backdropOf(dialog))
    await waitFor(() => {
      expectDialogClosed()
    })
  })

  it('moves focus into the dialog when it opens and back to the New sprint button when it closes', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: CREATE_TITLE }))
    })
  })

  it('locks body scroll while open and unlocks it once closed', async () => {
    const user = userEvent.setup()
    await renderSprintView()

    expect(document.body.style.overflow).not.toBe('hidden')

    await openCreateSprint(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })
})

// ---------------------------------------------------------------------------
// Field reset on every close path (T13b regression: Escape is a *new* close
// path this migration introduces, and it must reset fields exactly like the
// existing Cancel button does).
// ---------------------------------------------------------------------------

describe('SprintView create-sprint overlay — field reset on every close path', () => {
  it('clears all four fields when Escape closes it, so reopening starts blank', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    let dialog = getDialog()
    fillRequiredFields(dialog)
    fireEvent.change(within(dialog).getByLabelText('Capacity (optional)'), {
      target: { value: '20' },
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expectDialogClosed()
    })

    await openCreateSprint(user)
    dialog = getDialog()
    expect(within(dialog).getByLabelText('Sprint name')).toHaveValue('')
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('')
    expect(within(dialog).getByLabelText('End date')).toHaveValue('')
    expect(within(dialog).getByLabelText('Capacity (optional)')).toHaveValue(null)
  })

  it('clears all four fields when the backdrop closes it, so reopening starts blank', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    let dialog = getDialog()
    fillRequiredFields(dialog)

    fireEvent.mouseDown(backdropOf(dialog))
    await waitFor(() => {
      expectDialogClosed()
    })

    await openCreateSprint(user)
    dialog = getDialog()
    expect(within(dialog).getByLabelText('Sprint name')).toHaveValue('')
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('')
    expect(within(dialog).getByLabelText('End date')).toHaveValue('')
  })

  it('clears all four fields when a successful submit closes it, so reopening starts blank', async () => {
    const user = userEvent.setup()
    vi.mocked(sprintsApi.create).mockResolvedValue({ data: makeSprint() } as never)
    await renderSprintView()
    await openCreateSprint(user)

    let dialog = getDialog()
    fillRequiredFields(dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expectDialogClosed()
    })

    await openCreateSprint(user)
    dialog = getDialog()
    expect(within(dialog).getByLabelText('Sprint name')).toHaveValue('')
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('')
    expect(within(dialog).getByLabelText('End date')).toHaveValue('')
  })
})

// ---------------------------------------------------------------------------
// AC2 — the date-field grid becomes sm:grid-cols-2
// ---------------------------------------------------------------------------

describe('SprintView create-sprint overlay (AC2 — date fields stack on a phone)', () => {
  it('puts the start/end date pair in a grid gated behind sm:, not a bare grid-cols-2', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    const grid = gridHostOf(within(dialog).getByLabelText('Start date'))

    expect(grid, 'the start/end date pair sits in a two-column grid').not.toBeNull()
    expect((grid as HTMLElement).classList.contains('sm:grid-cols-2')).toBe(true)
    expect((grid as HTMLElement).classList.contains('grid-cols-2')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Submit still works — the migration must not change behaviour.
// ---------------------------------------------------------------------------

describe('SprintView create-sprint overlay — submit behaviour is unchanged', () => {
  it('still creates the sprint with the typed values and same payload shape when Create is pressed', async () => {
    const user = userEvent.setup()
    vi.mocked(sprintsApi.create).mockResolvedValue({ data: makeSprint() } as never)
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    fillRequiredFields(dialog)
    fireEvent.change(within(dialog).getByLabelText('Capacity (optional)'), {
      target: { value: '15' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(sprintsApi.create).toHaveBeenCalledWith('proj-1', {
        name: 'Sprint Zeta',
        start_date: '2026-02-01',
        end_date: '2026-02-14',
        capacity: 15,
      })
    })
  })

  it('sends null capacity when the optional field is left blank', async () => {
    const user = userEvent.setup()
    vi.mocked(sprintsApi.create).mockResolvedValue({ data: makeSprint() } as never)
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    fillRequiredFields(dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(sprintsApi.create).toHaveBeenCalledWith('proj-1', {
        name: 'Sprint Zeta',
        start_date: '2026-02-01',
        end_date: '2026-02-14',
        capacity: null,
      })
    })
  })
})

// ---------------------------------------------------------------------------
// AC4 — no horizontal body scroll at 320px. jsdom cannot lay anything out, so
// this is a regression guard on the one construct that *would* force
// horizontal overflow if it existed (a fixed-width panel wider than the
// viewport, expressed as a class token), not a pixel measurement. The ticket
// itself confirms AC4 is already satisfied in the browser; this only pins
// down that the create-sprint migration doesn't reintroduce a fixed px width.
// ---------------------------------------------------------------------------

describe('SprintView create-sprint overlay (AC4 guard — no fixed-width panel that would force horizontal scroll)', () => {
  it('does not size the dialog panel with a fixed pixel width', async () => {
    const user = userEvent.setup()
    await renderSprintView()
    await openCreateSprint(user)

    const dialog = getDialog()
    expect(dialog.className).not.toMatch(/w-\[min\(90vw/)
    expect(dialog.classList.contains('w-full')).toBe(true)
  })
})
