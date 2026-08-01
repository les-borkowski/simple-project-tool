import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeTask, makeUser } from '../test/factories'
import { SprintView } from './SprintView'
import type { MemberResponse, SprintResponse } from '../services/api'

// T07: Sprint card sprint-reassignment menu (non-drag fallback).
//
// Equivalent of the board card status menu, but for moving a task between
// sprints on SprintView. Must reuse the T04 Menu component and route the
// update through the same call shape `handleSprintDragEnd`'s cross-sprint
// branch already produces:
//   tasksApi.update(taskId, { sprint_id: destSprintId })
//
// The trigger's accessible name is asserted as `sprints.assign_sprint`
// ("Assign to sprint") and the "no sprint" menu option as `sprints.no_sprint`
// ("No sprint") — both locale keys already exist in en-GB.json/pl.json and
// are otherwise unused in the app, which is a strong signal they were added
// for this control. If the implementer picks different copy for the trigger
// itself, only the "finds the control" tests below need their name updated;
// the API-shape assertions do not depend on the copy.

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
    },
    tasksApi: {
      ...actual.tasksApi,
      listForProject: vi.fn(),
      update: vi.fn(),
      reorder: vi.fn().mockResolvedValue({ data: { updated: 0 } }),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
})

import { projectsApi, sprintsApi, tasksApi } from '../services/api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(__dirname, 'SprintView.tsx')
function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf-8')
}

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
    task_count: 1,
    ...overrides,
  }
}

async function setupTwoSprintsWithOneTask() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1', effort_unit: null })
  const sprint1 = makeSprint({ id: 'sprint-1', name: 'Sprint 1', task_count: 1 })
  const sprint2 = makeSprint({ id: 'sprint-2', name: 'Sprint 2', task_count: 0 })
  const task = makeTask({ id: 'task-1', title: 'A sprint task', sprint_id: 'sprint-1' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(sprintsApi.list).mockResolvedValue({ data: [sprint1, sprint2] } as never)
  vi.mocked(tasksApi.listForProject).mockResolvedValue({ data: { items: [task], next_cursor: null } } as never)

  renderWithProviders(<SprintView projectId="proj-1" />, {
    auth: { user: manager, isAuthenticated: true },
  })

  const taskLink = await screen.findByRole('link', { name: /a sprint task/i })
  const row = taskLink.parentElement as HTMLElement
  return { row }
}

describe('Sprint card sprint-reassignment menu (T07)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an "Assign to sprint" control on the task row', async () => {
    const { row } = await setupTwoSprintsWithOneTask()

    expect(within(row).getByRole('button', { name: 'Assign to sprint' })).toBeInTheDocument()
  })

  it('opens a menu listing the project\'s other sprints when the control is tapped', async () => {
    const user = userEvent.setup()
    const { row } = await setupTwoSprintsWithOneTask()

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))

    expect(await screen.findByRole('button', { name: 'Sprint 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No sprint' })).toBeInTheDocument()
  })

  it('moves the task to the chosen sprint using the same call shape a drag produces', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { row } = await setupTwoSprintsWithOneTask()

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))
    await user.click(await screen.findByRole('button', { name: 'Sprint 2' }))

    // handleSprintDragEnd's cross-sprint branch calls exactly:
    //   tasksApi.update(active.id, { sprint_id: destSprintId })
    expect(tasksApi.update).toHaveBeenCalledWith('task-1', { sprint_id: 'sprint-2' })
  })

  it('unassigns the task from any sprint when "No sprint" is chosen', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { row } = await setupTwoSprintsWithOneTask()

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))
    await user.click(await screen.findByRole('button', { name: 'No sprint' }))

    expect(tasksApi.update).toHaveBeenCalledWith('task-1', { sprint_id: null })
  })

  it('is reachable by real Tab navigation, not just direct .focus(), and Enter still opens the menu (T07 review, finding 1)', async () => {
    const user = userEvent.setup()
    const { row } = await setupTwoSprintsWithOneTask()

    const trigger = within(row).getByRole('button', { name: 'Assign to sprint' })
    // Simulate a real keyboard user: Tab through the page until landing on
    // the trigger, rather than jumping to it with .focus() (which bypasses
    // the row's drag-listener wrapper and its own tab stop entirely, and so
    // could not have caught the real-browser bug this test guards against).
    for (let i = 0; i < 25 && document.activeElement !== trigger; i++) {
      await user.tab()
    }
    expect(trigger).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: 'Sprint 2' })).toBeInTheDocument()
  })

  it('closes the assign-sprint menu on Escape and returns focus to the trigger (T07 review, finding 2)', async () => {
    const user = userEvent.setup()
    const { row } = await setupTwoSprintsWithOneTask()

    const trigger = within(row).getByRole('button', { name: 'Assign to sprint' })
    await user.click(trigger)
    expect(await screen.findByRole('button', { name: 'Sprint 2' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Sprint 2' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('updates the sprint task-count badges immediately after reassignment, without a refetch (T07 review, finding 4)', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { row } = await setupTwoSprintsWithOneTask()

    const sprint1Card = screen.getByRole('link', { name: 'Sprint 1' }).closest('div')?.parentElement as HTMLElement
    const sprint2Card = screen.getByRole('link', { name: 'Sprint 2' }).closest('div')?.parentElement as HTMLElement
    expect(within(sprint1Card).getByText(/1 tasks/i)).toBeInTheDocument()
    expect(within(sprint2Card).getByText(/0 tasks/i)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))
    await user.click(await screen.findByRole('button', { name: 'Sprint 2' }))

    await waitFor(() => {
      expect(within(sprint2Card).getByText(/1 tasks/i)).toBeInTheDocument()
    })
    expect(within(sprint1Card).getByText(/0 tasks/i)).toBeInTheDocument()
  })

  it('moves the task out of the Sprint 1 card and into the Sprint 2 card in the rendered UI', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockResolvedValue({ data: {} } as never)
    const { row } = await setupTwoSprintsWithOneTask()

    const sprint1Header = screen.getByRole('link', { name: 'Sprint 1' })
    const sprint1Card = sprint1Header.closest('div')?.parentElement as HTMLElement
    const sprint2Header = screen.getByRole('link', { name: 'Sprint 2' })
    const sprint2Card = sprint2Header.closest('div')?.parentElement as HTMLElement

    expect(within(sprint1Card).getByRole('link', { name: /a sprint task/i })).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))
    await user.click(await screen.findByRole('button', { name: 'Sprint 2' }))

    await waitFor(() => {
      expect(within(sprint2Card).getByRole('link', { name: /a sprint task/i })).toBeInTheDocument()
    })
    expect(within(sprint1Card).queryByRole('link', { name: /a sprint task/i })).not.toBeInTheDocument()
  })

  it('rolls back the sprint assignment in the UI if the request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(tasksApi.update).mockRejectedValue(new Error('network error'))
    const { row } = await setupTwoSprintsWithOneTask()

    const sprint1Header = screen.getByRole('link', { name: 'Sprint 1' })
    const sprint1Card = sprint1Header.closest('div')?.parentElement as HTMLElement

    await user.click(within(row).getByRole('button', { name: 'Assign to sprint' }))
    await user.click(await screen.findByRole('button', { name: 'Sprint 2' }))

    await waitFor(() => {
      expect(within(sprint1Card).getByRole('link', { name: /a sprint task/i })).toBeInTheDocument()
    })
  })

  describe('sortable task row is wrapped in the drag-row utility class (carried forward from T05 review)', () => {
    it('carries drag-row on SortableTaskRow\'s drag-listener wrapper', async () => {
      const { row } = await setupTwoSprintsWithOneTask()

      expect(
        row.className,
        `Expected SprintView's SortableTaskRow drag-listener wrapper to carry the "drag-row" ` +
          `class so iOS's link-preview sheet doesn't hijack the long-press. Got class="${row.className || '(none)'}".`,
      ).toMatch(/\bdrag-row\b/)
    })
  })

  describe('drag wiring is unchanged (regression guard — live drag itself is left to a device pass)', () => {
    it('still wires the sprint DndContext to the shared drag-end handler', () => {
      expect(readSource()).toMatch(/onDragEnd=\{handleSprintDragEnd\}/)
    })

    it('still uses useSortable for sprint task rows', () => {
      expect(readSource()).toMatch(/useSortable\(/)
    })
  })
})
