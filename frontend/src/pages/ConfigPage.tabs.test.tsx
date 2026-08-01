import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor, within } from '../test/render'
import { setViewportWidth } from '../test/setup'
import { makeProject, makeUser } from '../test/factories'
import { ConfigPage } from './ConfigPage'

// ---------------------------------------------------------------------------
// T10 adoption: Settings is the worst offender on a phone — a 200px nav column
// with no mobile fallback at any width, and two groups of bare <button>s with
// no tab semantics.
//
// This file asserts the page's user-visible result, not that it imports Tabs
// (a component boundary is an internal). "It adopted Tabs" is observed as:
// real tablist/tab/tabpanel roles, roving tabindex, arrow navigation that skips
// the disabled API Keys section, and the active tab being scrolled into view.
// An implementation that inlines the same behaviour by hand passes — and that
// is fine, because the rendered result is what users get.
//
// jsdom computes no layout, so AC4/AC5/AC7 (grid → flex column, body padding,
// "nothing overflows at 320px") are class-token assertions only. They are
// flagged as browser-pass items in the T10 report.
// ---------------------------------------------------------------------------

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      list: vi.fn(),
      get: vi.fn(),
      listMembers: vi.fn(),
    },
    authApi: { ...actual.authApi, changePassword: vi.fn() },
  }
})

import { authApi, projectsApi } from '../services/api'

function renderConfigPage(auth: { logout?: () => Promise<void> } = {}) {
  vi.mocked(projectsApi.list).mockResolvedValue({
    data: { items: [makeProject({ id: 'proj-1', name: 'Apollo' })], next_cursor: null },
  } as never)
  vi.mocked(projectsApi.get).mockResolvedValue({
    data: makeProject({ id: 'proj-1', name: 'Apollo' }),
  } as never)
  vi.mocked(projectsApi.listMembers).mockResolvedValue({ data: [] } as never)

  return renderWithProviders(<ConfigPage />, {
    auth: {
      user: makeUser({ name: 'Ada Lovelace', email: 'ada@example.com' }),
      isAuthenticated: true,
      ...auth,
    },
  })
}

/** The nearest ancestor of `inner` that also contains `other`. */
function commonAncestorOf(inner: HTMLElement, other: HTMLElement): HTMLElement {
  let node: HTMLElement | null = inner
  while (node && !node.contains(other)) {
    node = node.parentElement
  }
  expect(node, 'expected the two elements to share an ancestor inside the page').not.toBeNull()
  return node as HTMLElement
}

/** The direct child of `parent` that contains `descendant`. */
function directChildContaining(parent: HTMLElement, descendant: HTMLElement): HTMLElement {
  let node: HTMLElement = descendant
  while (node.parentElement && node.parentElement !== parent) {
    node = node.parentElement
  }
  expect(node.parentElement, 'expected the element to be nested inside the given parent').toBe(
    parent
  )
  return node
}

function expectMobileFirstBodyPadding(body: HTMLElement) {
  const tokens = Array.from(body.classList)

  for (const token of ['px-4', 'py-5', 'md:px-8', 'md:py-6']) {
    expect(tokens, `settings body must carry "${token}"`).toContain(token)
  }
  expect(tokens, 'the unprefixed px-8 gutter is what squeezes the phone body').not.toContain('px-8')
  expect(tokens, 'the unprefixed py-6 gutter is retired').not.toContain('py-6')
}

/**
 * The tablist a given tab belongs to. Looking the group up through one of its
 * own tabs — rather than by accessible name — keeps these tests from caring
 * what the implementer names each group, while still requiring every tab to
 * live inside a real tablist.
 */
function tablistContaining(tabName: string | RegExp): HTMLElement {
  const owner = screen.getByRole('tab', { name: tabName }).closest('[role="tablist"]')
  expect(owner, 'every tab must sit inside a tablist').not.toBeNull()
  return owner as HTMLElement
}

const scopeTablist = () => tablistContaining('App Settings')
const sectionTablist = () => tablistContaining(/Profile/)

async function openSecuritySection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Security'))
  return screen.findByLabelText('Current password')
}

async function fillPasswordForm(
  user: ReturnType<typeof userEvent.setup>,
  { current = 'old-pass', next = 'new-pass', confirm = 'new-pass' } = {}
) {
  await user.type(screen.getByLabelText('Current password'), current)
  await user.type(screen.getByLabelText('New password'), next)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
}

// ---------------------------------------------------------------------------
// AC1 — real tab semantics, on both tab groups
// ---------------------------------------------------------------------------

describe('ConfigPage settings-scope tabs', () => {
  it('exposes App Settings and Project Settings as a named tablist', () => {
    renderConfigPage()

    const scope = scopeTablist()

    expect(within(scope).getByRole('tab', { name: 'App Settings' })).toBeInTheDocument()
    expect(within(scope).getByRole('tab', { name: 'Project Settings' })).toBeInTheDocument()
  })

  it('marks App Settings as the selected scope on first load', () => {
    renderConfigPage()

    expect(screen.getByRole('tab', { name: 'App Settings' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('switches to the project settings body from the keyboard alone', async () => {
    const user = userEvent.setup()
    renderConfigPage()

    screen.getByRole('tab', { name: 'App Settings' }).focus()
    await user.keyboard('{ArrowRight}')

    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Project Settings' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  })

  it('gives the two tab groups distinct accessible names so screen readers can tell them apart', () => {
    renderConfigPage()

    const names = screen
      .getAllByRole('tablist')
      .map((list) => list.getAttribute('aria-label') ?? '')

    expect(names).toHaveLength(2)
    for (const name of names) {
      expect(name.length, 'every tablist needs an accessible name').toBeGreaterThan(0)
      expect(name, 'accessible name must be translated, not a raw i18n key').not.toMatch(/^config\./)
    }
    expect(new Set(names).size).toBe(2)
  })

  it('shows only the scope tablist once the project settings scope is active', async () => {
    const user = userEvent.setup()
    renderConfigPage()

    await user.click(screen.getByRole('tab', { name: 'Project Settings' }))

    expect(await screen.findByRole('combobox')).toBeInTheDocument()
    expect(screen.getAllByRole('tablist')).toHaveLength(1)
  })
})

describe('ConfigPage app settings section nav', () => {
  it('exposes Profile, API Keys and Security as tabs', () => {
    renderConfigPage()

    const sections = sectionTablist()

    expect(within(sections).getByRole('tab', { name: /Profile/ })).toBeInTheDocument()
    expect(within(sections).getByRole('tab', { name: /API Keys/ })).toBeInTheDocument()
    expect(within(sections).getByRole('tab', { name: /Security/ })).toBeInTheDocument()
  })

  it('keeps exactly one section tab in the page tab order', () => {
    renderConfigPage()

    const sections = sectionTablist()
    const inTabOrder = within(sections)
      .getAllByRole('tab')
      .filter((el) => el.getAttribute('tabindex') === '0')

    expect(inTabOrder).toHaveLength(1)
    expect(inTabOrder[0]).toHaveAccessibleName(/Profile/)
  })

  it('shows the change-password form when Security is activated', async () => {
    const user = userEvent.setup()
    renderConfigPage()

    await user.click(screen.getByRole('tab', { name: /Security/ }))

    expect(await screen.findByLabelText('Current password')).toBeInTheDocument()
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  })

  it('renders the section body as a tabpanel labelled by the active section tab', async () => {
    renderConfigPage()

    const panel = screen.getByRole('tabpanel')
    const labelledBy = panel.getAttribute('aria-labelledby')

    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)).toBe(
      screen.getByRole('tab', { name: /Profile/ })
    )
    expect(await within(panel).findByText('Appearance')).toBeInTheDocument()
  })

  it('gives every tab on the page a unique id, across both tab groups', () => {
    renderConfigPage()

    // The two groups sit on the same page and the scope tabs point at whichever
    // panel is showing, so a shared id namespace would make aria-labelledby
    // resolve to the wrong tab as soon as a key appeared in both groups.
    const ids = screen.getAllByRole('tab').map((el) => el.id)

    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('announces the unavailable API Keys section as disabled instead of hiding it', () => {
    renderConfigPage()

    expect(screen.getByRole('tab', { name: /API Keys/ })).toHaveAttribute('aria-disabled', 'true')
  })

  it('refuses to activate the disabled API Keys section when it is clicked', async () => {
    const user = userEvent.setup()
    renderConfigPage()

    await user.click(screen.getByRole('tab', { name: /API Keys/ }))

    expect(screen.getByRole('tab', { name: /API Keys/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /Profile/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('arrows straight past the disabled API Keys section from Profile to Security', async () => {
    const user = userEvent.setup()
    setViewportWidth(1280)
    renderConfigPage()

    screen.getByRole('tab', { name: /Profile/ }).focus()
    await user.keyboard('{ArrowDown}')

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Security/ }))
    expect(await screen.findByLabelText('Current password')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /API Keys/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('scrolls the newly active section tab into view, so an off-screen tab is reachable', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    setViewportWidth(375)
    renderConfigPage()

    scrollIntoView.mockClear()
    await user.click(screen.getByRole('tab', { name: /Security/ }))

    expect(scrollIntoView.mock.contexts).toContain(screen.getByRole('tab', { name: /Security/ }))
  })
})

// ---------------------------------------------------------------------------
// AC3 / AC4 / AC5 / AC7 — layout. Class-presence only under jsdom.
// ---------------------------------------------------------------------------

describe('ConfigPage responsive layout', () => {
  function appSettingsLayout() {
    const container = commonAncestorOf(
      screen.getByText('Profile'),
      screen.getByText('Appearance')
    )
    return {
      container,
      body: directChildContaining(container, screen.getByText('Appearance')),
    }
  }

  it('stacks the section nav above the body below lg and only grids at lg and up', () => {
    setViewportWidth(375)
    renderConfigPage()

    const tokens = Array.from(appSettingsLayout().container.classList)

    expect(tokens).toContain('flex-1')
    expect(tokens, 'below lg the nav and body stack').toEqual(
      expect.arrayContaining(['flex', 'flex-col'])
    )
    expect(tokens, 'the 200px column must be gated behind lg').toContain('lg:grid')
    expect(tokens).toContain('lg:grid-cols-[200px_1fr]')
    expect(tokens, 'an ungated grid is what breaks the phone today').not.toContain('grid')
    expect(tokens, 'an ungated 200px column is what breaks the phone today').not.toContain(
      'grid-cols-[200px_1fr]'
    )
  })

  it('pads the app settings body for a phone first and restores the desktop gutter at md', () => {
    setViewportWidth(375)
    renderConfigPage()

    expectMobileFirstBodyPadding(appSettingsLayout().body)
  })

  it('pads the project settings body the same way', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    renderConfigPage()

    await user.click(screen.getByRole('tab', { name: 'Project Settings' }))
    await screen.findByRole('combobox')

    expectMobileFirstBodyPadding(screen.getByRole('tabpanel'))
  })

  it('renders the section nav as a horizontal scroller at 320px instead of a fixed column', () => {
    setViewportWidth(320)
    renderConfigPage()

    const sections = sectionTablist()
    const tokens = Array.from(sections.classList)

    expect(tokens, 'the section nav must scroll sideways on a phone').toContain('overflow-x-auto')
    expect(tokens, 'at lg it is the vertical nav again').toContain('lg:flex-col')
    expect(tokens, 'a 200px width on the nav itself would overflow 320px').not.toContain('w-[200px]')
  })

  it('keeps every scope and section tab on one unwrapped line at 320px', () => {
    setViewportWidth(320)
    renderConfigPage()

    for (const el of screen.getAllByRole('tab')) {
      const tokens = Array.from(el.classList)
      expect(tokens, `"${el.textContent}" must not shrink`).toContain('shrink-0')
      expect(tokens, `"${el.textContent}" must not wrap`).toContain('whitespace-nowrap')
    }
  })

  it('leaves the desktop shell on the 200px column with its vertical rule', () => {
    setViewportWidth(1280)
    renderConfigPage()

    const { container } = appSettingsLayout()

    expect(Array.from(container.classList)).toEqual(
      expect.arrayContaining(['lg:grid', 'lg:grid-cols-[200px_1fr]'])
    )
    expect(
      sectionTablist().className,
      'the desktop nav keeps its right-hand rule'
    ).toMatch(/\blg:border-r\b/)
  })

  it('keeps the existing active-tab styling so the desktop nav looks unchanged', () => {
    setViewportWidth(1280)
    renderConfigPage()

    const active = screen.getByRole('tab', { name: /Profile/ })

    expect(Array.from(active.classList)).toEqual(
      expect.arrayContaining(['bg-stone-100', 'dark:bg-stone-900', 'font-medium'])
    )
  })
})

// ---------------------------------------------------------------------------
// AC6 — the hand-rolled password-changed overlay becomes a Modal
// ---------------------------------------------------------------------------

describe('ConfigPage password change', () => {
  it('shows a saving state and blocks a second submit while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolve: (() => void) | undefined
    vi.mocked(authApi.changePassword).mockReturnValue(
      new Promise<void>((r) => {
        resolve = () => r()
      }) as never
    )
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))

    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
    await user.click(saving)
    expect(authApi.changePassword).toHaveBeenCalledTimes(1)

    resolve?.()
  })

  it('confirms the change in a dialog named by its title', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))

    const dialog = await screen.findByRole('dialog', { name: 'Password changed' })
    expect(within(dialog).getByText('Your password has been updated successfully.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders that dialog outside the page container, so no scroll parent can clip it', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    const { container } = renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))

    const dialog = await screen.findByRole('dialog', { name: 'Password changed' })
    expect(container).not.toContainElement(dialog)
  })

  it('moves focus into the dialog so a keyboard user is not stranded behind it', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Password changed' })

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('dismisses on Escape and leaves the settings page usable', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await screen.findByRole('dialog', { name: 'Password changed' })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('dismisses when Stay logged in is chosen', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Password changed' })
    await user.click(within(dialog).getByRole('button', { name: 'Stay logged in' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Update password' })).toBeInTheDocument()
  })

  it('logs the user out when Log out is chosen in the dialog', async () => {
    const user = userEvent.setup()
    const logout = vi.fn(async () => {})
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage({ logout })
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))
    const dialog = await screen.findByRole('dialog', { name: 'Password changed' })
    await user.click(within(dialog).getByRole('button', { name: 'Log out' }))

    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('reports a wrong current password inline and shows no confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: { code: 'Current password is incorrect' } } },
    } as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user)

    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled()
  })

  it('rejects mismatched passwords without calling the API', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.changePassword).mockResolvedValue(undefined as never)
    renderConfigPage()
    await openSecuritySection(user)
    await fillPasswordForm(user, { next: 'new-pass', confirm: 'other-pass' })

    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(authApi.changePassword).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
