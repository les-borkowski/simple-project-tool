import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../../test/render'
import { AgentList } from './AgentList'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    agentsApi: {
      list: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      deactivate: vi.fn(),
      reactivate: vi.fn(),
      listKeys: vi.fn(),
      createKey: vi.fn(),
      revokeKey: vi.fn(),
    },
  }
})

import { agentsApi } from '../../services/api'

const AGENT = {
  id: 'agent-1',
  name: 'Release bot',
  is_active: true,
  created_at: '2026-09-01T00:00:00',
  key_count: 1,
}
const KEY = {
  id: 'key-1',
  label: 'ci',
  scopes: ['read:tasks'],
  last_used_at: null,
  created_at: '2026-09-01T00:00:00',
  expires_at: null,
}

function axiosError(status: number, code: string) {
  return Object.assign(new Error('conflict'), {
    isAxiosError: true,
    response: { status, data: { error: { code } } },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AgentList', () => {
  it('shows the empty state', async () => {
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [] } as never)
    renderWithProviders(<AgentList />)
    expect(await screen.findByText('No agents yet')).toBeInTheDocument()
  })

  it('creates an agent and shows the raw key once, until dismissed', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list)
      .mockResolvedValueOnce({ data: [] } as never)
      .mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.create).mockResolvedValue({
      data: { ...AGENT, key: { ...KEY, key: 'spt_agentsecret' } },
    } as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    await user.type(screen.getByLabelText('Name'), 'Release bot')
    await user.click(screen.getByRole('button', { name: 'Create agent' }))

    expect(await screen.findByText('spt_agentsecret')).toBeInTheDocument()
    expect(agentsApi.create).toHaveBeenCalledWith({
      name: 'Release bot',
      scopes: ['read:projects', 'read:stories', 'read:tasks', 'read:comments'],
    })

    await user.click(screen.getByRole('button', { name: 'Are you sure?' }))
    await waitFor(() => expect(screen.queryByText('spt_agentsecret')).not.toBeInTheDocument())
    expect(await screen.findByText('Release bot')).toBeInTheDocument()
    expect(screen.queryByText('spt_agentsecret')).not.toBeInTheDocument()
  })

  it('shows the limit message, never the raw code', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [] } as never)
    vi.mocked(agentsApi.create).mockRejectedValue(axiosError(409, 'AGENT_LIMIT_REACHED'))

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    await user.type(screen.getByLabelText('Name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create agent' }))

    expect(await screen.findByText('You have reached the maximum number of agents')).toBeInTheDocument()
    expect(screen.queryByText(/AGENT_LIMIT_REACHED/)).not.toBeInTheDocument()
  })

  it('shows the name-taken message on create and on rename', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.create).mockRejectedValue(axiosError(409, 'AGENT_NAME_TAKEN'))
    vi.mocked(agentsApi.rename).mockRejectedValue(axiosError(409, 'AGENT_NAME_TAKEN'))

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    await user.type(screen.getByLabelText('Name'), 'Release bot')
    await user.click(screen.getByRole('button', { name: 'Create agent' }))
    expect(await screen.findByText('You already have an agent with that name')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(input)
    await user.type(input, 'Other{Enter}')

    expect(agentsApi.rename).toHaveBeenCalledWith('agent-1', 'Other')
    expect(await screen.findByText('You already have an agent with that name')).toBeInTheDocument()
    expect(screen.queryByText(/AGENT_NAME_TAKEN/)).not.toBeInTheDocument()
  })

  it('deactivates through a confirm dialog, then offers Reactivate and disables New key', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list)
      .mockResolvedValueOnce({ data: [AGENT] } as never)
      .mockResolvedValue({ data: [{ ...AGENT, is_active: false }] } as never)
    vi.mocked(agentsApi.deactivate).mockResolvedValue({} as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    expect(agentsApi.deactivate).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Deactivate this agent/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    expect(agentsApi.deactivate).toHaveBeenCalledWith('agent-1')
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New key' })).toBeDisabled()
  })

  it('reactivates an inactive agent', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [{ ...AGENT, is_active: false }] } as never)
    vi.mocked(agentsApi.reactivate).mockResolvedValue({ data: AGENT } as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    expect(agentsApi.reactivate).toHaveBeenCalledWith('agent-1')
  })

  it('creates a key for the right agent and reveals it once', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.createKey).mockResolvedValue({ data: { ...KEY, key: 'spt_newkey' } } as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New key' }))
    await user.type(screen.getByLabelText('Key label'), 'ci')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('spt_newkey')).toBeInTheDocument()
    expect(agentsApi.createKey).toHaveBeenCalledWith('agent-1', {
      label: 'ci',
      scopes: ['read:projects', 'read:stories', 'read:tasks', 'read:comments'],
    })

    await user.click(screen.getByRole('button', { name: 'Are you sure?' }))
    await waitFor(() => expect(screen.queryByText('spt_newkey')).not.toBeInTheDocument())
  })

  it('lists keys and revokes one after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.listKeys)
      .mockResolvedValueOnce({ data: [KEY] } as never)
      .mockResolvedValue({ data: [] } as never)
    vi.mocked(agentsApi.revokeKey).mockResolvedValue({} as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Keys' }))
    expect(agentsApi.listKeys).toHaveBeenCalledWith('agent-1')
    expect(await screen.findByText('ci')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(agentsApi.revokeKey).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(agentsApi.revokeKey).toHaveBeenCalledWith('agent-1', 'key-1'))
    await waitFor(() => expect(agentsApi.listKeys).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('No active keys')).toBeInTheDocument()
  })

  it('stays silent on a demo-blocked create (the global toast speaks)', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [] } as never)
    vi.mocked(agentsApi.create).mockRejectedValue({ isDemoBlocked: true })

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New agent' }))
    await user.type(screen.getByLabelText('Name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create agent' }))

    await waitFor(() => expect(agentsApi.create).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the inactive-agent message (not the raw code) when creating a key fails', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.createKey).mockRejectedValue(axiosError(409, 'AGENT_INACTIVE'))

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New key' }))
    await user.type(screen.getByLabelText('Key label'), 'ci')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText(/This agent is deactivated/)).toBeInTheDocument()
    expect(screen.queryByText(/AGENT_INACTIVE/)).not.toBeInTheDocument()
  })

  it('warns about write scopes in both the agent and key forms', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'New key' }))
    expect(screen.queryByText(/Managers can create and delete/)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('write:tasks'))
    expect(screen.getByText(/Managers can create and delete/)).toBeInTheDocument()
  })

  it('stays silent when a demo account is blocked from deactivating', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.deactivate).mockRejectedValue({ isDemoBlocked: true })

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(agentsApi.deactivate).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a generic error when the keys cannot load', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    vi.mocked(agentsApi.listKeys).mockRejectedValue(new Error('boom'))

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Keys' }))

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })

  it('does not fire Deactivate twice on a double click of the confirm button', async () => {
    const user = userEvent.setup()
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT] } as never)
    let resolve: () => void = () => {}
    vi.mocked(agentsApi.deactivate).mockReturnValue(new Promise<void>((r) => { resolve = r }) as never)

    renderWithProviders(<AgentList />)
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' })
    await user.dblClick(confirm)

    expect(agentsApi.deactivate).toHaveBeenCalledTimes(1)
    resolve()
  })

  it('shows the right keys when two agents are expanded back to back and responses arrive out of order', async () => {
    const user = userEvent.setup()
    const B = { ...AGENT, id: 'agent-2', name: 'Other bot' }
    vi.mocked(agentsApi.list).mockResolvedValue({ data: [AGENT, B] } as never)
    let resolveA: (v: unknown) => void = () => {}
    let resolveB: (v: unknown) => void = () => {}
    vi.mocked(agentsApi.listKeys).mockImplementation(((id: string) =>
      new Promise((r) => { if (id === 'agent-1') resolveA = r; else resolveB = r })) as never)

    renderWithProviders(<AgentList />)
    const keysButtons = await screen.findAllByRole('button', { name: 'Keys' })
    await user.click(keysButtons[0])
    await user.click(screen.getByRole('button', { name: 'Hide keys' }))
    await user.click(screen.getAllByRole('button', { name: 'Keys' })[1])

    resolveB({ data: [{ ...KEY, id: 'key-b', label: 'key of B' }] })
    expect(await screen.findByText('key of B')).toBeInTheDocument()
    resolveA({ data: [{ ...KEY, id: 'key-a', label: 'key of A' }] })

    await waitFor(() => expect(screen.getByText('key of B')).toBeInTheDocument())
    expect(screen.queryByText('key of A')).not.toBeInTheDocument()
  })

  it('surfaces an error when the list cannot load', async () => {
    vi.mocked(agentsApi.list).mockRejectedValue(new Error('boom'))
    renderWithProviders(<AgentList />)
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })
})
