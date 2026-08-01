import { describe, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../test/render'
import { expectTapSafeControl } from '../test/tapSafeRecipe'
import { makeProject, makeStory, makeUser } from '../test/factories'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { MemberResponse, StoryResponse } from '../services/api'

// ---------------------------------------------------------------------------
// T21 AC1 — ProjectDetailPage header toolbar (Invite / New / More actions)
// and the stories table's per-row Edit/Delete actions.
//
// jsdom computes no layout (css: false), so this is a class-token assertion,
// never a measured height/width. Every element below is a native <button>
// (display:inline-block by UA default), so none hits the inline-display
// trap that expectTapSafeControl guards for <a> elements — but the shared
// helper still checks for the `tap-safe` token itself, which is the part
// that is actually missing today.
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
    storiesApi: {
      ...actual.storiesApi,
      list: vi.fn(),
    },
    tasksApi: {
      ...actual.tasksApi,
      list: vi.fn(),
    },
    statusesApi: {
      ...actual.statusesApi,
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    preferencesApi: {
      ...actual.preferencesApi,
      get: vi.fn().mockRejectedValue(new Error('not needed for this test')),
    },
  }
})

import { projectsApi, storiesApi, tasksApi } from '../services/api'

async function setupHeaderToolbar() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1',
    auth: { user: manager, isAuthenticated: true },
  })

  await screen.findByRole('heading', { name: project.name })
}

async function setupStoriesRow(story: StoryResponse) {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({ data: { items: [story], next_cursor: null } } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=stories',
    auth: { user: manager, isAuthenticated: true },
  })

  await screen.findByRole('link', { name: story.title })
}

describe('ProjectDetailPage header toolbar tap-target pass (T21 AC1)', () => {
  it('makes the Invite trigger tap-safe (32px measured)', async () => {
    await setupHeaderToolbar()

    expectTapSafeControl(screen.getByRole('button', { name: /invite/i }), 'the header "Invite" button')
  })

  it('makes the New menu trigger tap-safe (30px measured)', async () => {
    await setupHeaderToolbar()

    expectTapSafeControl(screen.getByRole('button', { name: /^New$/ }), 'the header "New" menu trigger')
  })

  it('makes the icon-only "More actions" trigger tap-safe (26x26 measured)', async () => {
    await setupHeaderToolbar()

    expectTapSafeControl(
      screen.getByRole('button', { name: /more actions/i }),
      'the header "More actions" icon trigger'
    )
  })
})

describe('ProjectDetailPage stories table row actions tap-target pass (T21 AC1)', () => {
  it('makes the per-row Edit and Delete actions tap-safe', async () => {
    const story = makeStory({ id: 'story-1', title: 'Ship the login flow', is_default: false })
    await setupStoriesRow(story)

    expectTapSafeControl(screen.getByRole('button', { name: 'Edit' }), 'the story row "Edit" action')
    expectTapSafeControl(screen.getByRole('button', { name: 'Delete' }), 'the story row "Delete" action')
  })
})

async function setupMembersTab() {
  const manager = makeUser({ role: 'manager' })
  const project = makeProject({ id: 'proj-1' })
  const member: MemberResponse = {
    user_id: manager.id,
    role: 'manager',
    joined_at: new Date().toISOString(),
    name: manager.name,
    email: manager.email,
  }

  vi.mocked(projectsApi.get).mockResolvedValue({ data: project } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [member] } as never)
  vi.mocked(storiesApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)
  vi.mocked(tasksApi.list).mockResolvedValue({ data: { items: [], next_cursor: null } } as never)

  renderWithProviders(<ProjectDetailPage />, {
    path: '/projects/:id',
    route: '/projects/proj-1?tab=members',
    auth: { user: manager, isAuthenticated: true },
  })

  await screen.findByRole('heading', { name: project.name })
  // The members row (and its Delete action) only exists once listMembers has
  // resolved and rendered, so anchor on it before querying for buttons.
  return screen.findByRole('button', { name: 'Delete' })
}

describe('ProjectDetailPage members tab tap-target gap (T21 AC1)', () => {
  // Both the header toolbar and the Members tab render an "Invite" trigger
  // while the Members tab is active (the header cluster is not tab-gated).
  // They are NOT ambiguous by accessible name, though: the header button's
  // label key is `board.invite` -> "Invite", while the Members-tab button's
  // label key is `members.invite` -> "Invite member". Querying by the exact
  // name "Invite member" targets only the Members-tab trigger, so no `within`
  // scoping or `getAllByRole()[n]` indexing is needed.
  it('makes the members-row Delete action tap-safe', async () => {
    const deleteButton = await setupMembersTab()

    expectTapSafeControl(deleteButton, 'the members row "Delete" action')
  })

  it('makes the Members-tab Invite trigger tap-safe', async () => {
    await setupMembersTab()

    expectTapSafeControl(
      screen.getByRole('button', { name: 'Invite member' }),
      'the Members-tab "Invite" trigger'
    )
  })
})
