import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { expectCanonicalHeader, pageHeaderAround } from '../test/pageHeaderRecipe'
import { makeProject, makeUser } from '../test/factories'
import { InvitationsPage } from './InvitationsPage'
import { ProjectsPage } from './ProjectsPage'
import { SearchResultsPage } from './SearchResultsPage'

// ---------------------------------------------------------------------------
// T09 AC5 + AC6: the three simplest pages adopt PageHeader, their toolbars wrap
// at 375px, and ProjectsPage's two hand-rolled overlays become real Modals.
//
// One shared file rather than three co-located ones, because the whole point of
// the ticket is that these pages converge on ONE header recipe — asserting that
// convergence in one place makes a page drifting back obvious. The recipe
// itself lives in `test/pageHeaderRecipe`, so the pages whose headers carry
// enough of their own behaviour to warrant a file of their own
// (ProjectDetailPage) assert the very same one.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    invitationsApi: { ...actual.invitationsApi, mine: vi.fn() },
    searchApi: { ...actual.searchApi, search: vi.fn() },
  }
})

import { invitationsApi, projectsApi, searchApi } from '../services/api'

async function renderProjectsPage() {
  vi.mocked(projectsApi.list).mockResolvedValue({
    data: { items: [makeProject({ id: 'proj-1', name: 'Apollo' })], next_cursor: null },
  } as never)

  const view = renderWithProviders(<ProjectsPage />, {
    auth: { user: makeUser({ role: 'manager' }), isAuthenticated: true },
  })
  await screen.findByText('Apollo')
  return view
}

async function renderInvitationsPage() {
  vi.mocked(invitationsApi.mine).mockResolvedValue({ data: [] } as never)

  const view = renderWithProviders(<InvitationsPage />, {
    auth: { user: makeUser(), isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1, name: 'Invitations' })
  return view
}

async function renderSearchResultsPage() {
  vi.mocked(searchApi.search).mockResolvedValue({ data: [] } as never)

  const view = renderWithProviders(<SearchResultsPage />, {
    route: '/search?q=apollo',
    auth: { user: makeUser(), isAuthenticated: true },
  })
  await screen.findByRole('heading', { level: 1 })
  return view
}

describe('ProjectsPage adopts PageHeader', () => {
  it('renders its header with the canonical padding recipe and sticky offset', async () => {
    await renderProjectsPage()

    expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Projects' }))
  })

  it('still shows the active-project count under the title', async () => {
    await renderProjectsPage()

    expect(await screen.findByText(/1 active/)).toBeInTheDocument()
  })

  it('lets the filter toolbar wrap at 375px instead of squashing it onto one line', async () => {
    setViewportWidth(375)
    await renderProjectsPage()

    const [statusFilter] = screen.getAllByRole('combobox')
    const toolbar = statusFilter.parentElement as HTMLElement

    expect(toolbar).toContainElement(screen.getByPlaceholderText('Search…'))
    expect(Array.from(toolbar.classList), 'the filter toolbar must wrap at 375px').toContain(
      'flex-wrap'
    )
    expect(Array.from(toolbar.classList)).not.toContain('flex-nowrap')
  })

  it('keeps every filter control reachable at 375px', async () => {
    setViewportWidth(375)
    await renderProjectsPage()

    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: /archived/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New project/ })).toBeInTheDocument()
  })
})

describe("ProjectsPage's inline overlays become Modals (AC6)", () => {
  it('opens the create overlay as a labelled dialog', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: /New project/ }))

    const dialog = await screen.findByRole('dialog', { name: 'New project' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('escapes any clipping ancestor by portalling the create overlay to the body', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: /New project/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New project' })

    expect((dialog.parentElement as HTMLElement).parentElement).toBe(document.body)
  })

  it('closes the create overlay on Escape', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: /New project/ }))
    await screen.findByRole('dialog', { name: 'New project' })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument()
    })
  })

  it('moves focus into the create overlay so a keyboard user is not stranded behind it', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: /New project/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New project' })

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('opens the edit overlay as a labelled dialog', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit' })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('closes the edit overlay on Escape', async () => {
    const user = userEvent.setup()
    await renderProjectsPage()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByRole('dialog', { name: 'Edit' })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit' })).not.toBeInTheDocument()
    })
  })
})

describe('InvitationsPage adopts PageHeader', () => {
  it('renders its header with the canonical padding recipe and sticky offset', async () => {
    await renderInvitationsPage()

    expectCanonicalHeader(screen.getByRole('heading', { level: 1, name: 'Invitations' }))
  })

  it('keeps the subtitle line under the title', async () => {
    await renderInvitationsPage()

    expect(
      screen.getByText('Project invitations waiting for your response.')
    ).toBeInTheDocument()
  })

  it('still shows the empty state when there are no pending invitations', async () => {
    await renderInvitationsPage()

    expect(await screen.findByText('No pending invitations')).toBeInTheDocument()
  })

  it('renders the same header markup at 375px and 1280px', async () => {
    setViewportWidth(375)
    const mobile = await renderInvitationsPage()
    const mobileHtml = pageHeaderAround(
      screen.getByRole('heading', { level: 1, name: 'Invitations' })
    ).outerHTML
    mobile.unmount()

    setViewportWidth(1280)
    await renderInvitationsPage()
    const desktopHtml = pageHeaderAround(
      screen.getByRole('heading', { level: 1, name: 'Invitations' })
    ).outerHTML

    expect(desktopHtml).toBe(mobileHtml)
  })
})

describe('SearchResultsPage adopts PageHeader', () => {
  it('renders its header with the canonical padding recipe and sticky offset', async () => {
    await renderSearchResultsPage()

    expectCanonicalHeader(screen.getByRole('heading', { level: 1 }))
  })

  it('still names the query in the page title', async () => {
    await renderSearchResultsPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'Search results for "apollo"'
    )
  })

  it('still shows the empty state for a query with no results', async () => {
    await renderSearchResultsPage()

    expect(await screen.findByText('No results for "apollo"')).toBeInTheDocument()
  })
})
