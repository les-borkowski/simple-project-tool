import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { makeUser } from '../../test/factories'
import { QuickCaptureModal } from './QuickCaptureModal'

// The capture flow's failure modes are the part a user actually meets: a server with no
// LLM key configured, their own key revoked, a rate limit, or a demo account. Each needs
// to say something different — collapsing them all into "try again later" leaves a user
// waiting forever for a state that will never change on its own.

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    captureApi: { preview: vi.fn(), confirm: vi.fn() },
    storiesApi: { ...actual.storiesApi, list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
    projectsApi: {
      ...actual.projectsApi,
      listMembers: vi.fn().mockResolvedValue({ data: [] }),
    },
  }
})

import { captureApi } from '../../services/api'

function axiosError(status: number, code?: string, headers: Record<string, string> = {}) {
  return {
    isAxiosError: true,
    response: {
      status,
      headers,
      data: code ? { error: { code, message: code } } : {},
    },
    message: 'Request failed',
  }
}

async function renderAndPreview(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(
    <QuickCaptureModal projectId="proj-1" onClose={() => {}} onCreated={() => {}} />,
    { auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true } }
  )
  await user.type(
    screen.getByPlaceholderText('Describe one or more tasks in your own words…'),
    'fix the bug'
  )
  await user.click(screen.getByRole('button', { name: 'Preview tasks' }))
}

describe('QuickCaptureModal error states', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tells the user their instance has no LLM key configured, rather than to try again later', async () => {
    const user = userEvent.setup()
    vi.mocked(captureApi.preview).mockRejectedValue(axiosError(503, 'LLM_NOT_CONFIGURED'))

    await renderAndPreview(user)

    // This state never resolves by waiting — it needs someone to configure a key, which
    // the user can do themselves under Settings → AI Providers.
    const message = await screen.findByRole('alert')
    expect(message.textContent).not.toMatch(/try again later/i)
    expect(message.textContent).toMatch(/not configured|provider key|settings/i)
  })

  it('points at the key when the provider rejects the user own credential', async () => {
    const user = userEvent.setup()
    vi.mocked(captureApi.preview).mockRejectedValue(axiosError(502, 'LLM_KEY_INVALID'))

    await renderAndPreview(user)

    const message = await screen.findByRole('alert')
    expect(message.textContent).toMatch(/key/i)
    expect(message.textContent).not.toMatch(/try again later/i)
  })

  it('still reports a genuine outage as temporary', async () => {
    const user = userEvent.setup()
    vi.mocked(captureApi.preview).mockRejectedValue(axiosError(503, 'LLM_UNAVAILABLE'))

    await renderAndPreview(user)

    expect((await screen.findByRole('alert')).textContent).toMatch(/temporarily unavailable/i)
  })

  it('tells a rate-limited user how long to wait, using the Retry-After header', async () => {
    const user = userEvent.setup()
    vi.mocked(captureApi.preview).mockRejectedValue(
      axiosError(429, 'LLM_RATE_LIMITED', { 'retry-after': '42' })
    )

    await renderAndPreview(user)

    expect((await screen.findByRole('alert')).textContent).toMatch(/42/)
  })

  it('shows no inline error for a demo account, which already gets the global toast', async () => {
    const user = userEvent.setup()
    // The api interceptor rejects demo writes with a plain Error, not an AxiosError, so
    // getApiErrorMessage returns undefined and the modal used to render
    // "Something went wrong" on top of the toast the interceptor already raised.
    const demoError = Object.assign(new Error('DEMO_ACCOUNT'), { isDemoBlocked: true })
    vi.mocked(captureApi.preview).mockRejectedValue(demoError)

    await renderAndPreview(user)

    await waitFor(() => expect(captureApi.preview).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
