import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import { renderWithProviders, screen, waitFor, within } from '../../test/render'
import { makeStory, makeTask, makeUser } from '../../test/factories'
import { QuickCaptureModal } from './QuickCaptureModal'
import type { CaptureResponse, MemberResponse } from '../../services/api'

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
    captureApi: {
      preview: vi.fn(),
      confirm: vi.fn(),
    },
  }
})

import { captureApi, projectsApi, storiesApi } from '../../services/api'

const TITLE = 'Quick capture'
const BACKLOG = makeStory({ id: 'story-1', title: 'Backlog', is_default: true })
const currentUser = makeUser({ id: 'user-manager', name: 'Ada Lovelace', role: 'manager' })

function primeApi() {
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
}

function makeCaptureResponse(overrides: Partial<CaptureResponse> = {}): CaptureResponse {
  return {
    tasks: [],
    unparseable: false,
    needs_confirmation: true,
    warnings: [],
    model: 'gemini-3.1-flash-lite',
    prompt_version: 'v1',
    latency_ms: 1200,
    ...overrides,
  }
}

async function openAndSubmit(ue: ReturnType<typeof userEvent.setup>, text: string) {
  await ue.type(screen.getByPlaceholderText('Describe one or more tasks in your own words…'), text)
  await ue.click(screen.getByRole('button', { name: 'Preview tasks' }))
}

function renderModal(overrides: { onCreated?: (t: unknown) => void; onClose?: () => void } = {}) {
  primeApi()
  const onCreated = overrides.onCreated ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  renderWithProviders(
    <QuickCaptureModal projectId="proj-1" onCreated={onCreated as never} onClose={onClose} />,
    { auth: { user: currentUser, isAuthenticated: true } }
  )
  return { onCreated, onClose }
}

/**
 * Mounts the modal from a trigger in a later commit than the one that focused
 * that trigger — the ordering the focus trap needs for its restore target to
 * mean anything (see CreateTaskModal.test.tsx / useFocusTrap.test.tsx).
 */
function FocusHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Quick capture trigger
      </button>
      {open && (
        <QuickCaptureModal
          projectId="proj-1"
          onCreated={vi.fn()}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      )}
    </div>
  )
}

async function openViaTrigger(
  ue: ReturnType<typeof userEvent.setup>,
  options: { onClose?: () => void } = {}
): Promise<void> {
  primeApi()
  renderWithProviders(<FocusHarness {...options} />, {
    auth: { user: currentUser, isAuthenticated: true },
  })
  await ue.click(screen.getByRole('button', { name: 'Quick capture trigger' }))
  await screen.findByRole('heading', { name: TITLE })
}

describe('QuickCaptureModal', () => {
  it('previews with the typed text and today\'s local date, then renders the review list', async () => {
    const ue = userEvent.setup()
    renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [
          {
            title: 'Fix login bug',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: '2026-09-05',
            priority: 'high',
            confidence: 0.95,
            low_confidence: false,
          },
        ],
      }),
    } as never)

    await openAndSubmit(ue, 'finish the login bug fix by Friday')

    await screen.findByDisplayValue('Fix login bug')

    const now = new Date()
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(captureApi.preview).toHaveBeenCalledWith(
      'proj-1',
      'finish the login bug fix by Friday',
      expectedDate
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('starts a low-confidence task unchecked and a normal-confidence task checked', async () => {
    const ue = userEvent.setup()
    renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [
          {
            title: 'Confident task',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: null,
            priority: null,
            confidence: 0.9,
            low_confidence: false,
          },
          {
            title: 'Unsure task',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: null,
            priority: null,
            confidence: 0.2,
            low_confidence: true,
          },
        ],
      }),
    } as never)

    await openAndSubmit(ue, 'do the confident thing and maybe the unsure thing')

    const confidentRow = (await screen.findByDisplayValue('Confident task')).closest('div.flex.flex-col') as HTMLElement
    const unsureRow = screen.getByDisplayValue('Unsure task').closest('div.flex.flex-col') as HTMLElement

    expect(within(confidentRow).getByRole('checkbox')).toBeChecked()
    expect(within(unsureRow).getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByText('Low confidence')).toBeInTheDocument()
  })

  it('creates only the checked tasks and calls onCreated with the response', async () => {
    const ue = userEvent.setup()
    const { onCreated } = renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [
          {
            title: 'Keep me',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: '2026-09-10',
            priority: 'medium',
            confidence: 0.9,
            low_confidence: false,
          },
          {
            title: 'Drop me',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: null,
            priority: null,
            confidence: 0.1,
            low_confidence: true,
          },
        ],
      }),
    } as never)

    const createdTask = makeTask({ id: 'task-1', story_id: 'story-1', title: 'Keep me' })
    vi.mocked(captureApi.confirm).mockResolvedValue({ data: { created: [createdTask] } } as never)

    await openAndSubmit(ue, 'keep me and drop me')
    await screen.findByDisplayValue('Keep me')

    await ue.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(captureApi.confirm).toHaveBeenCalledWith('proj-1', [
        {
          title: 'Keep me',
          description: null,
          story_id: 'story-1',
          assignee_id: null,
          due_date: '2026-09-10',
          priority: 'medium',
        },
      ])
    })
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith([createdTask])
    })
  })

  it('carries the AI-extracted description into the review field and the confirm payload', async () => {
    const ue = userEvent.setup()
    renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [
          {
            title: 'Fix login bug',
            description: 'Users cannot log in with SSO after the last deploy.',
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: null,
            priority: null,
            confidence: 0.95,
            low_confidence: false,
          },
        ],
      }),
    } as never)

    const createdTask = makeTask({ id: 'task-1', story_id: 'story-1', title: 'Fix login bug' })
    vi.mocked(captureApi.confirm).mockResolvedValue({ data: { created: [createdTask] } } as never)

    await openAndSubmit(ue, 'fix the login bug')

    expect(
      await screen.findByDisplayValue('Users cannot log in with SSO after the last deploy.')
    ).toBeInTheDocument()

    await ue.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(captureApi.confirm).toHaveBeenCalledWith('proj-1', [
        expect.objectContaining({
          title: 'Fix login bug',
          description: 'Users cannot log in with SSO after the last deploy.',
        }),
      ])
    })
  })

  it('blocks confirm and shows a validation message when a checked task has a blank title', async () => {
    const ue = userEvent.setup()
    renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [
          {
            title: 'Fix login bug',
            description: null,
            story_hint: null,
            story_id: 'story-1',
            story_resolved: true,
            assignee_hint: null,
            assignee_id: null,
            assignee_resolved: false,
            due_date: null,
            priority: null,
            confidence: 0.95,
            low_confidence: false,
          },
        ],
      }),
    } as never)

    await openAndSubmit(ue, 'fix the login bug')

    const titleInput = await screen.findByDisplayValue('Fix login bug')
    await ue.clear(titleInput)
    await ue.type(titleInput, '   ')

    await ue.click(screen.getByRole('button', { name: 'Create' }))

    await screen.findByText('Each selected task needs a title.')
    expect(captureApi.confirm).not.toHaveBeenCalled()
  })

  it('keeps the input step and shows the warning, preserving the typed text, when tasks is empty', async () => {
    const ue = userEvent.setup()
    renderModal()

    vi.mocked(captureApi.preview).mockResolvedValue({
      data: makeCaptureResponse({
        tasks: [],
        unparseable: true,
        warnings: ['Could not understand the input as a task'],
      }),
    } as never)

    const typed = 'hello, how are you today'
    await openAndSubmit(ue, typed)

    await screen.findByText('Could not understand the input as a task')
    expect(screen.getByPlaceholderText('Describe one or more tasks in your own words…')).toHaveValue(typed)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows the distinct unavailable message on a 503, not the generic error', async () => {
    const ue = userEvent.setup()
    renderModal()

    const err = new axios.AxiosError('Service unavailable')
    err.response = {
      status: 503,
      data: { error: { code: 'LLM_UNAVAILABLE', message: 'llm down', details: [] } },
    } as never
    vi.mocked(captureApi.preview).mockRejectedValue(err)

    await openAndSubmit(ue, 'anything at all')

    await screen.findByText('Capture is temporarily unavailable. Please try again later.')
    expect(screen.queryByText('Something went wrong. Please try again.')).not.toBeInTheDocument()
  })

  it('never calls confirm when the modal is cancelled', async () => {
    const ue = userEvent.setup()
    const { onClose } = renderModal()

    await ue.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(captureApi.confirm).not.toHaveBeenCalled()
  })

  it('renders with the expected title', async () => {
    renderModal()
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
  })

  it('returns focus to the trigger button when closed via the Cancel button', async () => {
    const ue = userEvent.setup()
    await openViaTrigger(ue)

    await ue.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Quick capture trigger' }))
    })
  })

  it('returns focus to the trigger button when closed via Escape', async () => {
    const ue = userEvent.setup()
    await openViaTrigger(ue)

    await ue.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Quick capture trigger' }))
    })
  })

  it('caps the capture text at the length the backend accepts', async () => {
    const ue = userEvent.setup()
    await openViaTrigger(ue)

    const box = screen.getByPlaceholderText('Describe one or more tasks in your own words…')
    expect(box).toHaveAttribute('maxLength', '4000')

    // Paste past the cap: userEvent.type would be 4001 keystrokes.
    await ue.click(box)
    await ue.paste('a'.repeat(4100))

    expect((box as HTMLTextAreaElement).value).toHaveLength(4000)
    expect(screen.getByText('4000 / 4000')).toBeInTheDocument()
  })
})
