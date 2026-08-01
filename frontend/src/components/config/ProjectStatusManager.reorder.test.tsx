import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { makeProjectStatus, makeUser } from '../../test/factories'
import type { ProjectStatusResponse } from '../../services/api'
import { ProjectStatusManager } from './ProjectStatusManager'

// T06: HTML5 drag → dnd-kit + reorder buttons on ProjectStatusManager.
//
// The ↑/↓ buttons are the primary surface under test: they are directly
// clickable in jsdom (unlike a pointer/touch drag, which dnd-kit gates behind
// real browser events and timers jsdom does not model) and they exercise the
// exact same reorder path a drag would use. Native <button> elements are also
// keyboard-operable by construction (Enter/Space triggers a click), which is
// what satisfies "reordering works via keyboard" here without attempting to
// simulate dnd-kit's KeyboardSensor pickup/move/drop sequence — that
// simulation depends on timers and pointer/keyboard event internals that are
// unreliable in jsdom and would be a flaky test, not a real one.
//
// Order is asserted only on what is rendered: the row's name <input> values,
// read via getAllByRole('textbox'), in DOM order top-to-bottom. Nothing here
// touches component state, props, or dnd-kit internals.

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn(),
      update: vi.fn(),
    },
  }
})

import { statusesApi } from '../../services/api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(__dirname, 'ProjectStatusManager.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf-8')
}

function threeStatuses() {
  return [
    makeProjectStatus({ id: 'status-1', name: 'To Do', order: 0 }),
    makeProjectStatus({ id: 'status-2', name: 'In Progress', order: 1 }),
    makeProjectStatus({ id: 'status-3', name: 'Done', order: 2 }),
  ]
}

async function renderManager() {
  vi.mocked(statusesApi.list).mockResolvedValue({ data: threeStatuses() } as never)
  vi.mocked(statusesApi.update).mockResolvedValue({ data: {} } as never)

  renderWithProviders(<ProjectStatusManager projectId="proj-1" isManager={true} />, {
    auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
  })

  // Wait for the initial fetch to settle and rows to render.
  await screen.findByDisplayValue('To Do')
}

function nameOrder(): string[] {
  return screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)
}

describe('ProjectStatusManager reordering (T06)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('no HTML5 drag props remain in the source', () => {
    it('does not use the draggable attribute', () => {
      expect(readSource()).not.toMatch(/\bdraggable\b/)
    })

    it('does not use onDragStart', () => {
      expect(readSource()).not.toMatch(/\bonDragStart\b/)
    })

    it('does not use onDragOver', () => {
      expect(readSource()).not.toMatch(/\bonDragOver\b/)
    })

    it('does not use onDrop', () => {
      expect(readSource()).not.toMatch(/\bonDrop\b/)
    })
  })

  it('renders an accessible Move up and Move down control for every row', async () => {
    await renderManager()

    const upButtons = screen.getAllByRole('button', { name: 'Move up' })
    const downButtons = screen.getAllByRole('button', { name: 'Move down' })

    expect(upButtons).toHaveLength(3)
    expect(downButtons).toHaveLength(3)
  })

  it('disables Move up on the first row but not on the others', async () => {
    await renderManager()

    const upButtons = screen.getAllByRole('button', { name: 'Move up' })

    expect(upButtons[0]).toBeDisabled()
    expect(upButtons[1]).toBeEnabled()
    expect(upButtons[2]).toBeEnabled()
  })

  it('disables Move down on the last row but not on the others', async () => {
    await renderManager()

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })

    expect(downButtons[0]).toBeEnabled()
    expect(downButtons[1]).toBeEnabled()
    expect(downButtons[2]).toBeDisabled()
  })

  it('moves a row down and swaps it with its neighbour when its Move down button is clicked', async () => {
    const user = userEvent.setup()
    await renderManager()

    expect(nameOrder()).toEqual(['To Do', 'In Progress', 'Done'])

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])

    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))
  })

  it('moves a row up and swaps it with its neighbour when its Move up button is clicked', async () => {
    const user = userEvent.setup()
    await renderManager()

    const upButtons = screen.getAllByRole('button', { name: 'Move up' })
    await user.click(upButtons[2]) // "Done" moves up, swapping with "In Progress"

    await waitFor(() => expect(nameOrder()).toEqual(['To Do', 'Done', 'In Progress']))
  })

  it('is operable from the keyboard: focusing Move down and pressing Enter reorders the row', async () => {
    const user = userEvent.setup()
    await renderManager()

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    downButtons[0].focus()
    expect(downButtons[0]).toHaveFocus()

    await user.keyboard('{Enter}')

    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))
  })

  it('updates the rendered order immediately, before the reorder PATCH resolves (optimistic update)', async () => {
    const user = userEvent.setup()
    await renderManager()

    let resolveUpdate!: (value: AxiosResponse<ProjectStatusResponse>) => void
    vi.mocked(statusesApi.update).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve })
    )

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])

    // The PATCH is still pending (never resolved yet), but the row order
    // must already reflect the move — that's what "optimistic" means.
    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))

    resolveUpdate({ data: makeProjectStatus() } as AxiosResponse<ProjectStatusResponse>)
  })

  it('rolls back to the prior order and shows an error toast when the reorder PATCH is rejected', async () => {
    const user = userEvent.setup()
    await renderManager()

    vi.mocked(statusesApi.update).mockRejectedValue(new Error('network error'))
    // A failed reorder re-syncs from the server rather than restoring a
    // client-invented "previous" snapshot (a partial batch failure may have
    // already committed some PATCHes). Model that here: the server's own
    // state, fetched by the post-failure refresh(), is the prior order.
    vi.mocked(statusesApi.list).mockResolvedValueOnce({ data: threeStatuses() } as never)

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])

    // Toast must appear to tell the user the reorder failed.
    await screen.findByText('Failed to save changes')

    // And the list must be back to its original order, not left showing the
    // optimistic (now-wrong) order or some inconsistent partial state.
    await waitFor(() => expect(nameOrder()).toEqual(['To Do', 'In Progress', 'Done']))
  })

  it('disables the Move up and Move down buttons while a reorder batch is in flight', async () => {
    const user = userEvent.setup()
    await renderManager()

    const resolvers: Array<(value: AxiosResponse<ProjectStatusResponse>) => void> = []
    vi.mocked(statusesApi.update).mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve) })
    )

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])

    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))

    // While the batch is still pending, every row's reorder buttons must be
    // disabled — including on rows that aren't first/last.
    for (const btn of screen.getAllByRole('button', { name: 'Move up' })) {
      expect(btn).toBeDisabled()
    }
    for (const btn of screen.getAllByRole('button', { name: 'Move down' })) {
      expect(btn).toBeDisabled()
    }

    resolvers.forEach((resolve) => resolve({ data: makeProjectStatus() } as AxiosResponse<ProjectStatusResponse>))

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Move down' })[0]).toBeEnabled())
  })

  it('does not let an earlier, failing reorder discard a later, successful reorder (no stale rollback closure)', async () => {
    const user = userEvent.setup()
    await renderManager()

    // First batch: will reject, and is still pending when we try to start
    // a second one.
    let rejectFirst!: (reason: unknown) => void
    vi.mocked(statusesApi.update).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject })
    ).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject })
    ).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject })
    )
    vi.mocked(statusesApi.list).mockResolvedValueOnce({ data: threeStatuses() } as never)

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])
    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))

    // A second reorder attempted while the first is still in flight must be
    // a no-op (the reorder path is serialized), so clicking again here does
    // not fire a second, overlapping batch.
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done'])

    // The first batch now rejects: error toast shown, list re-synced from
    // the server (the prior order, per the mocked refresh above).
    rejectFirst(new Error('network error'))
    await screen.findByText('Failed to save changes')
    await waitFor(() => expect(nameOrder()).toEqual(['To Do', 'In Progress', 'Done']))

    // Now that the guard has lifted, a fresh reorder succeeds and its
    // result must stick — nothing from the earlier failed batch should be
    // able to clobber it afterwards.
    vi.mocked(statusesApi.update).mockResolvedValue({ data: {} } as never)
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0])
    await waitFor(() => expect(nameOrder()).toEqual(['In Progress', 'To Do', 'Done']))
  })

  it('does not leak an unhandled promise rejection when the reorder PATCH fails', async () => {
    const user = userEvent.setup()
    await renderManager()

    vi.mocked(statusesApi.update).mockRejectedValue(new Error('network error'))

    const unhandled = vi.fn()
    window.addEventListener('unhandledrejection', unhandled)

    const downButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(downButtons[0])

    await screen.findByText('Failed to save changes')

    // Give any stray unhandled rejection a turn of the event loop to surface.
    await new Promise((resolve) => setTimeout(resolve, 0))

    window.removeEventListener('unhandledrejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
