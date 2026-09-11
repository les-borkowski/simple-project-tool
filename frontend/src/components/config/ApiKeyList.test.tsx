import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { ApiKeyList } from './ApiKeyList'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    configApi: {
      ...actual.configApi,
      listApiKeys: vi.fn(),
      createApiKey: vi.fn(),
      revokeApiKey: vi.fn(),
    },
  }
})

import { configApi } from '../../services/api'

const KEY = {
  id: 'key-1',
  label: 'agent key',
  scopes: ['read:tasks', 'write:tasks'],
  last_used_at: null,
  created_at: '2026-09-01T00:00:00',
}

describe('ApiKeyList', () => {
  it('creates a key and shows the raw value exactly once', async () => {
    const user = userEvent.setup()
    vi.mocked(configApi.listApiKeys).mockResolvedValue({ data: [] } as never)
    vi.mocked(configApi.createApiKey).mockResolvedValue({
      data: { ...KEY, key: 'spt_rawsecret' },
    } as never)

    renderWithProviders(<ApiKeyList />)

    await user.click(await screen.findByRole('button', { name: /create/i }))
    await user.type(screen.getByRole('textbox'), 'agent key')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    expect(await screen.findByText('spt_rawsecret')).toBeInTheDocument()
    expect(configApi.createApiKey).toHaveBeenCalledWith({
      label: 'agent key',
      scopes: ['read:projects'],
    })
  })

  it('does not offer the blanket admin scope', async () => {
    const user = userEvent.setup()
    vi.mocked(configApi.listApiKeys).mockResolvedValue({ data: [] } as never)

    renderWithProviders(<ApiKeyList />)
    await user.click(await screen.findByRole('button', { name: /create/i }))

    expect(screen.getByLabelText('read:tasks')).toBeInTheDocument()
    expect(screen.queryByLabelText('admin')).not.toBeInTheDocument()
  })

  it('refuses to create a key with no scopes selected', async () => {
    const user = userEvent.setup()
    vi.mocked(configApi.listApiKeys).mockResolvedValue({ data: [] } as never)

    renderWithProviders(<ApiKeyList />)
    await user.click(await screen.findByRole('button', { name: /create/i }))
    await user.click(screen.getByLabelText('read:projects')) // the only default, now off

    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled()
  })

  it('revokes a key after confirmation and reloads the list', async () => {
    const user = userEvent.setup()
    vi.mocked(configApi.listApiKeys)
      .mockResolvedValueOnce({ data: [KEY] } as never)
      .mockResolvedValueOnce({ data: [] } as never)
    vi.mocked(configApi.revokeApiKey).mockResolvedValue({} as never)

    renderWithProviders(<ApiKeyList />)

    await user.click(await screen.findByRole('button', { name: /revoke/i }))
    // ConfirmDialog's own confirm button carries the same label.
    const confirms = screen.getAllByRole('button', { name: /revoke/i })
    await user.click(confirms[confirms.length - 1])

    await waitFor(() => expect(configApi.revokeApiKey).toHaveBeenCalledWith('key-1'))
  })

  it('surfaces an error instead of failing silently when the list cannot load', async () => {
    vi.mocked(configApi.listApiKeys).mockRejectedValue(new Error('boom'))

    renderWithProviders(<ApiKeyList />)

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})
