import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { makeProject, makeProjectStatus, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { AgentResponse, MemberResponse } from '../services/api'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      get: vi.fn(),
      listMembers: vi.fn(),
      addAgent: vi.fn(),
      removeMember: vi.fn(),
    },
    agentsApi: { ...actual.agentsApi, list: vi.fn() },
    storiesApi: { ...actual.storiesApi, list: vi.fn() },
    tasksApi: { ...actual.tasksApi, list: vi.fn().mockResolvedValue({ data: { items: [], next_cursor: null } }) },
    sprintsApi: { ...actual.sprintsApi, list: vi.fn().mockResolvedValue({ data: [] }) },
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
    preferencesApi: { ...actual.preferencesApi, get: vi.fn(), update: vi.fn().mockResolvedValue({ data: {} }) },
  }
})

import { agentsApi, preferencesApi, projectsApi, statusesApi, storiesApi } from '../services/api'

const ME = makeUser({ id: 'user-me', role: 'manager', name: 'Ada Lovelace', email: 'ada@example.com' })

function member(over: Partial<MemberResponse> = {}): MemberResponse {
  return {
    user_id: ME.id,
    role: 'manager',
    joined_at: '2026-09-01T00:00:00',
    name: ME.name,
    email: ME.email,
    kind: 'human',
    ...over,
  }
}

function agent(over: Partial<AgentResponse> = {}): AgentResponse {
  return { id: 'agent-1', name: 'Release bot', is_active: true, created_at: '2026-09-01T00:00:00', key_count: 1, ...over }
}

function axiosError(status: number, code: string) {
  return Object.assign(new Error('x'), { isAxiosError: true, response: { status, data: { error: { code } } } })
}

async function openMembers(opts: { myRole?: 'manager' | 'contributor'; members?: MemberResponse[]; agents?: AgentResponse[] } = {}) {
  const { myRole = 'manager', members, agents = [] } = opts
  const user = userEvent.setup()
  vi.mocked(projectsApi.get).mockResolvedValue({ data: makeProject({ id: 'proj-1', name: 'Apollo' }) } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: members ?? [member({ role: myRole })] } as never)
  vi.mocked(agentsApi.list).mockResolvedValue({ data: agents } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
  vi.mocked(statusesApi.list).mockResolvedValue({
    data: [makeProjectStatus({ slug: 'to_do', name: 'To Do', order: 0 })],
  } as never)
  vi.mocked(preferencesApi.get).mockResolvedValue({
    data: {
      id: 'p', user_id: ME.id, project_id: 'proj-1',
      tab_order: ['board', 'stories', 'sprints', 'timeline', 'members'], hidden_tabs: [], created_at: '', updated_at: '',
    },
  } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1',
    auth: { user: ME, isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: 'Apollo' })
  await user.click(await screen.findByRole('tab', { name: 'Members' }))
  return user
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ProjectDetailPage members: agents', () => {
  it('shows Add agent to a project manager only', async () => {
    await openMembers({ myRole: 'manager' })
    expect(await screen.findByRole('button', { name: 'Add agent' })).toBeInTheDocument()
  })

  it('hides Add agent from a contributor', async () => {
    await openMembers({ myRole: 'contributor' })
    await screen.findByText('Ada Lovelace')
    expect(screen.queryByRole('button', { name: 'Add agent' })).not.toBeInTheDocument()
  })

  it('offers only active agents that are not already members', async () => {
    const user = await openMembers({
      members: [member(), member({ user_id: 'agent-3', name: 'Joined bot', email: null, kind: 'agent', role: 'contributor' })],
      agents: [
        agent(),
        agent({ id: 'agent-2', name: 'Dormant bot', is_active: false }),
        agent({ id: 'agent-3', name: 'Joined bot' }),
      ],
    })
    await user.click(await screen.findByRole('button', { name: 'Add agent' }))

    const dialog = await screen.findByRole('dialog')
    const select = await within(dialog).findByRole('combobox', { name: 'Agent' })
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Release bot'])
  })

  it('warns when Manager is chosen, attaches, and shows a Bot row without an email line', async () => {
    const user = await openMembers({ agents: [agent()] })
    vi.mocked(projectsApi.addAgent).mockResolvedValue({
      data: member({ user_id: 'agent-1', name: 'Release bot', email: null, kind: 'agent', role: 'manager' }),
    } as never)

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('combobox', { name: 'Agent' })
    expect(within(dialog).queryByText(/Managers can create and delete/)).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Role' }), 'manager')
    expect(within(dialog).getByText(/Managers can create and delete/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Add agent' }))

    await waitFor(() =>
      expect(projectsApi.addAgent).toHaveBeenCalledWith('proj-1', { agent_id: 'agent-1', role: 'manager' }),
    )
    const row = (await screen.findByText('Release bot')).closest('div.flex.items-center.gap-3') as HTMLElement
    expect(within(row).getByText('Bot')).toBeInTheDocument()
    expect(row.textContent).not.toMatch(/null/)
    expect(row.querySelectorAll('.text-stone-500').length).toBe(1) // role label only, no empty subtitle
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps human rows unchanged: email shown, no badge', async () => {
    await openMembers()
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
    expect(screen.queryByText('Bot')).not.toBeInTheDocument()
  })

  it.each([
    ['AGENT_INACTIVE', /deactivated/],
    ['User is already a member', /already a member/],
  ])('maps the %s error to a message, never the raw code', async (code, expected) => {
    const user = await openMembers({ agents: [agent()] })
    vi.mocked(projectsApi.addAgent).mockRejectedValue(axiosError(409, code))

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('combobox', { name: 'Agent' })
    await user.click(within(dialog).getByRole('button', { name: 'Add agent' }))

    expect(await within(dialog).findByText(expected)).toBeInTheDocument()
    expect(within(dialog).queryByText(code)).not.toBeInTheDocument()
  })

  it('shows an empty hint with a Settings link when no agent is eligible', async () => {
    const user = await openMembers({ agents: [agent({ is_active: false })] })
    await user.click(await screen.findByRole('button', { name: 'Add agent' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/no active agents/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/config?tab=agents')
    expect(within(dialog).getByRole('button', { name: 'Add agent' })).toBeDisabled()
  })
  it('shows an error and Retry (not the empty hint) when the agents list fails to load', async () => {
    const user = await openMembers()
    vi.mocked(agentsApi.list).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ data: [agent()] } as never)

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/something went wrong/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/no active agents/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(await within(dialog).findByRole('combobox', { name: 'Agent' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses a members-specific message for an inactive agent', async () => {
    const user = await openMembers({ agents: [agent()] })
    vi.mocked(projectsApi.addAgent).mockRejectedValue(axiosError(409, 'AGENT_INACTIVE'))

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('combobox', { name: 'Agent' })
    await user.click(within(dialog).getByRole('button', { name: 'Add agent' }))

    expect(await within(dialog).findByText(/before adding it to a project/)).toBeInTheDocument()
  })

  it('drops an attached agent from the picker, and offers it again after the member is removed', async () => {
    const user = await openMembers({ agents: [agent()] })
    vi.mocked(projectsApi.addAgent).mockResolvedValue({
      data: member({ user_id: 'agent-1', name: 'Release bot', email: null, kind: 'agent', role: 'contributor' }),
    } as never)
    vi.mocked(projectsApi.removeMember).mockResolvedValue({} as never)

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    let dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('combobox', { name: 'Agent' })
    await user.click(within(dialog).getByRole('button', { name: 'Add agent' }))
    await screen.findByText('Agent added')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add agent' }))
    dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/no active agents/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    const row = screen.getByText('Release bot').closest('div.flex.items-center.gap-3') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Release bot')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add agent' }))
    dialog = await screen.findByRole('dialog')
    const select = await within(dialog).findByRole('combobox', { name: 'Agent' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Release bot'])
  })

  it('stays silent when a demo account is blocked from attaching', async () => {
    const user = await openMembers({ agents: [agent()] })
    vi.mocked(projectsApi.addAgent).mockRejectedValue({ isDemoBlocked: true })

    await user.click(await screen.findByRole('button', { name: 'Add agent' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('combobox', { name: 'Agent' })
    await user.click(within(dialog).getByRole('button', { name: 'Add agent' }))

    await waitFor(() => expect(projectsApi.addAgent).toHaveBeenCalled())
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })
})
