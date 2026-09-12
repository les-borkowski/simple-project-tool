import { afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { makeUser } from '../../test/factories'
import { AiProvidersList } from './AiProvidersList'

// 276 lines of credential-handling UI that shipped without tests, while its sibling
// ApiKeyList gained a full file in the same branch. The security-relevant behaviour is
// that a typed key never lingers in the DOM, and that a validation slip does not make
// the user retype it.

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    configApi: {
      ...actual.configApi,
      availableLlmProviders: vi.fn(),
      listLlmProviders: vi.fn(),
      setLlmProvider: vi.fn(),
      deleteLlmProvider: vi.fn(),
    },
  }
})

import { configApi } from '../../services/api'

const GOOGLE = {
  id: 'google',
  label: 'Google Gemini',
  default_model: 'gemini-3.1-flash-lite',
  available: true,
  key_hint: 'starts with AIza',
  docs_url: 'https://aistudio.google.com/apikey',
}

function primeApi(configured: unknown[] = []) {
  vi.mocked(configApi.availableLlmProviders).mockResolvedValue({ data: [GOOGLE] } as never)
  vi.mocked(configApi.listLlmProviders).mockResolvedValue({ data: configured } as never)
  vi.mocked(configApi.setLlmProvider).mockResolvedValue({ data: {} } as never)
}

async function renderList(configured: unknown[] = []) {
  primeApi(configured)
  renderWithProviders(<AiProvidersList />, {
    auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
  })
  await screen.findByText('Google Gemini')
}

function keyField() {
  return screen.getByLabelText(/api key/i)
}

describe('AiProvidersList', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends a typed key and clears it from the DOM on success', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.type(keyField(), 'AIza-super-secret-key')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(configApi.setLlmProvider).toHaveBeenCalledWith(
        'google',
        expect.objectContaining({ api_key: 'AIza-super-secret-key' })
      )
    )
    await waitFor(() => expect((keyField() as HTMLInputElement).value).toBe(''))
  })

  it('clears a rejected key from the DOM too', async () => {
    const user = userEvent.setup()
    await renderList()
    vi.mocked(configApi.setLlmProvider).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { error: { code: 'LLM_KEY_INVALID', message: 'bad key' } } },
    })

    await user.type(keyField(), 'AIza-rejected-key')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect((keyField() as HTMLInputElement).value).toBe(''))
  })

  it('rejects a negative rate limit locally and keeps the typed key, so it need not be retyped', async () => {
    // `min={0}` is advisory; the field happily holds -5, and the backend now rejects
    // anything below 1. Catching it here avoids a round-trip — but the key must survive
    // that rejection, because no request went out, nothing was exposed, and making the
    // user retype a long secret over an unrelated typo is pure friction.
    const user = userEvent.setup()
    await renderList()

    await user.type(keyField(), 'AIza-key-worth-keeping')
    const rpm = screen.getByLabelText(/requests per minute/i)
    await user.clear(rpm)
    await user.type(rpm, '-5')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(configApi.setLlmProvider).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect((keyField() as HTMLInputElement).value).toBe('AIza-key-worth-keeping')
  })

  it('only sends is_default when the user actually touched it', async () => {
    const user = userEvent.setup()
    await renderList()

    await user.type(keyField(), 'AIza-key')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(configApi.setLlmProvider).toHaveBeenCalled())
    const payload = vi.mocked(configApi.setLlmProvider).mock.calls[0][1]
    expect(payload).not.toHaveProperty('is_default')
  })

  it('surfaces a save failure to the user', async () => {
    const user = userEvent.setup()
    await renderList()
    vi.mocked(configApi.setLlmProvider).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    })

    await user.type(keyField(), 'AIza-key')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
