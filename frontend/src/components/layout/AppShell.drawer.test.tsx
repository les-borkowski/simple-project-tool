import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { act, renderWithProviders, screen, waitFor, within } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { makeProject, makeUser } from '../../test/factories'
import { expectTapSafeControl } from '../../test/tapSafeRecipe'
import { Modal } from '../common/Modal'
import i18n from '../../i18n'
import { AppShell } from './AppShell'

// ---------------------------------------------------------------------------
// T12 — mobile shell: drawer navigation.
//
// Two rulings shape every query in this file:
//
// R1. The `<aside>` is `hidden lg:flex`, so it stays in the DOM at 375px and
//     merely has `display:none`. vitest runs with `css: false`, so jsdom
//     applies no Tailwind at all and nothing has a computed display. AC1 is
//     therefore asserted as a CLASS assertion, never as DOM absence — a
//     DOM-absence assertion would be unsatisfiable by the mandated markup and
//     would push the implementation into a JS media-query layout branch.
//
// R2. When the drawer is open there are TWO of every nav link and TWO <nav>
//     landmarks (the hidden aside copy and the drawer copy). Every query below
//     is scoped with `within(aside)` or `within(drawer)`; a bare getByRole
//     would throw "found multiple elements" and fail for the wrong reason.
//
// R3 (T21). AppShell calls the SAME `SidebarNav` component for both the
//     desktop <aside> and the drawer's copy (`nav()` in AppShell.tsx) — the
//     markup is never forked. So the T21 tap-safe assertions below, scoped to
//     the desktop aside, also cover the drawer's rows; there is no separate
//     drawer-only test for the same classes.
// ---------------------------------------------------------------------------

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    projectsApi: { ...actual.projectsApi, list: vi.fn() },
    invitationsApi: { ...actual.invitationsApi, mine: vi.fn() },
    recentApi: { ...actual.recentApi, list: vi.fn() },
  }
})

import { invitationsApi, projectsApi, recentApi } from '../../services/api'

const APOLLO = makeProject({ id: 'p-apollo', name: 'Apollo' })
const GEMINI = makeProject({ id: 'p-gemini', name: 'Gemini' })

function stubApi() {
  vi.mocked(projectsApi.list).mockResolvedValue({
    data: { items: [APOLLO, GEMINI], next_cursor: null },
  } as never)
  vi.mocked(invitationsApi.mine).mockResolvedValue({ data: [] } as never)
  vi.mocked(recentApi.list).mockResolvedValue({ data: [] } as never)
}

/** Shows the current pathname, so "the link navigated" is observable. */
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <p>path: {location.pathname}</p>
      <button
        type="button"
        onClick={() => {
          navigate('/config')
        }}
      >
        Go to settings from the page
      </button>
    </div>
  )
}

/**
 * A minimal page `Modal`, always open, rendered as AppShell's children — the
 * same position any real page's overlay would occupy. Used only for defect
 * I4's "⌘K while a page Modal is open" half below.
 */
function PageModalHost() {
  const [open, setOpen] = useState(true)
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Edit something">
      <p>Modal body</p>
    </Modal>
  )
}

/**
 * The hamburger's accessible name comes from the new `nav.open_menu` key, so
 * these tests are pinned to the key rather than to a particular English string.
 * Until the key exists in en-GB.json, i18next echoes the key back and the
 * lookups below miss — which is the intended RED for AC1.
 */
function openMenuName(): string {
  return i18n.t('nav.open_menu')
}

async function renderShell(route = '/') {
  stubApi()
  const view = renderWithProviders(
    <AppShell>
      <LocationProbe />
    </AppShell>,
    { route, auth: { user: makeUser({ name: 'Ada Lovelace' }), isAuthenticated: true } }
  )
  // Wait for the sidebar's own data to land, so nothing re-renders mid-test.
  await screen.findAllByText('Apollo')
  return view
}

/** Same shell, but with an already-open page Modal as its children. */
async function renderShellWithModalOpen(route = '/') {
  stubApi()
  const view = renderWithProviders(
    <AppShell>
      <PageModalHost />
    </AppShell>,
    { route, auth: { user: makeUser({ name: 'Ada Lovelace' }), isAuthenticated: true } }
  )
  await screen.findAllByText('Apollo')
  await screen.findByRole('dialog', { name: 'Edit something' })
  return view
}

function getAside(): HTMLElement {
  const aside = document.querySelector('aside')
  expect(aside, 'AppShell should still render an <aside> for the desktop sidebar').not.toBeNull()
  return aside as HTMLElement
}

function getHamburger(): HTMLElement {
  return screen.getByRole('button', { name: openMenuName() })
}

function getTopBar(): HTMLElement {
  return screen.getByRole('banner')
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(getHamburger())
  return screen.findByRole('dialog')
}

function tokens(element: HTMLElement): string[] {
  return Array.from(element.classList).sort()
}

describe('AppShell drawer navigation at 375px', () => {
  it('offers a hamburger that reports its expanded state and controls the drawer', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const hamburger = getHamburger()
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    const controls = hamburger.getAttribute('aria-controls')
    expect(controls).toBeTruthy()

    const drawer = await openDrawer(user)

    expect(hamburger).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(controls as string)).toBe(drawer)
  })

  // AC1, read per R1: the sidebar is display:none below lg rather than absent.
  it('keeps the sidebar aside out of the phone layout with hidden / lg:flex', async () => {
    setViewportWidth(375)
    await renderShell()

    const aside = getAside()

    expect(aside.classList.contains('hidden')).toBe(true)
    expect(aside.classList.contains('lg:flex')).toBe(true)
    expect(aside.classList.contains('flex')).toBe(false)
  })

  it('puts the mobile top bar in a banner landmark that disappears at the desktop breakpoint', async () => {
    setViewportWidth(375)
    await renderShell()

    const topBar = getTopBar()

    expect(topBar).toContainElement(getHamburger())
    for (const token of ['lg:hidden', 'sticky', 'top-0', 'z-30', 'h-topbar']) {
      expect(tokens(topBar)).toContain(token)
    }
  })

  it('renders the same navigation inside the drawer as the hidden sidebar holds', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const drawer = await openDrawer(user)

    expect(within(drawer).getByRole('link', { name: 'Invitations' })).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: /Simple Project Tool/ })).toBeInTheDocument()
  })

  // R2 made explicit: the duplication is intended, and each copy sits in its
  // own container. If this ever collapses to one, every scoped query above is
  // silently testing the wrong copy.
  it('has exactly two copies of each nav link while open — one in the aside, one in the drawer', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const drawer = await openDrawer(user)
    const aside = getAside()

    const invitations = screen.getAllByRole('link', { name: 'Invitations' })
    expect(invitations).toHaveLength(2)
    expect(invitations.filter((link) => aside.contains(link))).toHaveLength(1)
    expect(invitations.filter((link) => drawer.contains(link))).toHaveLength(1)
    expect(aside.contains(drawer)).toBe(false)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    await openDrawer(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(getHamburger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the backdrop is tapped', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const drawer = await openDrawer(user)
    await user.click(drawer.parentElement as HTMLElement)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('locks body scroll while open and releases it on close', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    expect(document.body.style.overflow).not.toBe('hidden')

    await openDrawer(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  it('traps Tab inside the drawer instead of walking into the hidden sidebar behind it', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const drawer = await openDrawer(user)
    const aside = getAside()

    await waitFor(() => {
      expect(drawer.contains(document.activeElement)).toBe(true)
    })

    for (let i = 0; i < 12; i += 1) {
      await user.tab()
      expect(drawer.contains(document.activeElement)).toBe(true)
      expect(aside.contains(document.activeElement)).toBe(false)
    }
  })

  it('can be opened from the keyboard alone', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const hamburger = getHamburger()
    hamburger.focus()
    expect(document.activeElement).toBe(hamburger)

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('returns focus to the hamburger after Escape, so the keyboard user is not stranded', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const hamburger = getHamburger()
    await openDrawer(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.activeElement).toBe(hamburger)
    })
  })

  // AC3, mechanism one: the link both navigates and calls onNavigate.
  it('navigates and closes the drawer when a project link is tapped', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell('/')

    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('link', { name: 'Apollo' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(`path: /projects/${APOLLO.id}`)).toBeInTheDocument()
  })

  // AC3, mechanism one in isolation (R4): tapping the link for the project you
  // are ALREADY on leaves `pathname` untouched, so auto-close never fires. Only
  // an onNavigate callback on the link can close the drawer here.
  it('closes the drawer when the link for the current project is tapped, though the path does not change', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell(`/projects/${APOLLO.id}`)

    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('link', { name: 'Apollo' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText(`path: /projects/${APOLLO.id}`)).toBeInTheDocument()
  })

  // AC3, mechanism two in isolation (R4): a navigation that does not originate
  // from a drawer link must still close the drawer.
  it('closes the drawer when the route changes from somewhere other than a drawer link', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell('/')

    await openDrawer(user)
    await user.click(screen.getByRole('button', { name: 'Go to settings from the page' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByText('path: /config')).toBeInTheDocument()
  })

  // AC5
  it('hides the ⌘K hint below lg, where there is no keyboard to press it on', async () => {
    setViewportWidth(375)
    await renderShell()

    const hint = within(getAside()).getByText('⌘K')

    expect(tokens(hint)).toContain('hidden')
    expect(hint.className).toMatch(/\blg:(inline|inline-block|block|flex)\b/)
  })

  // AC5
  it('opens the command palette from the top bar search control', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    await user.click(within(getTopBar()).getByRole('button', { name: /search/i }))

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  // AC6, tightened after review. Below lg the root is a flex COLUMN, so a bare
  // `min-h-dvh` on <main> stacks under the 48px top bar instead of sharing the
  // viewport with it — a floor beats flex-grow, and every phone page gained a
  // top-bar's worth of dead scroll. <main> keeps the unit only at the
  // breakpoint where the root is a row and the two heights overlap.
  it('sizes the shell with dvh so the mobile browser chrome cannot clip it', async () => {
    setViewportWidth(375)
    const { container } = await renderShell()

    const main = screen.getByRole('main')
    const root = main.parentElement as HTMLElement

    expect(tokens(root)).toContain('min-h-dvh')
    expect(tokens(main)).not.toContain('min-h-dvh')
    expect(tokens(main)).toContain('lg:min-h-dvh')
    expect(tokens(main)).toContain('flex-1')
    // Nothing anywhere may still use the 100vh-based unit.
    expect(container.querySelectorAll('[class~="min-h-screen"]')).toHaveLength(0)
  })

  // The drawer's own search control opens the command palette, which does not
  // portal. Both overlays compute z-index:50 in the same stacking context, so
  // leaving the drawer open buries the palette under it: DOM order decides, the
  // drawer owns the topmost focus trap, and taps on palette rows land on drawer
  // nav links. Opening the palette therefore has to close the drawer.
  it('closes the drawer when the palette is opened from inside it, leaving one overlay', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    const drawer = await openDrawer(user)
    await user.click(within(drawer).getByRole('button', { name: /search/i }))

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    })
  })

  // A keyboard is reachable below lg on a tablet, so the global shortcut has to
  // dismiss the drawer for the same reason the in-drawer control does.
  it('closes the drawer when the palette is opened with the keyboard shortcut', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    await openDrawer(user)
    await user.keyboard('{Meta>}k{/Meta}')

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    })
  })

  // Assistive tech announces the dialog's name, and "Open menu, dialog" reads
  // as an instruction. The hamburger keeps the imperative.
  it('names the drawer with a noun rather than the hamburger’s imperative', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    await openDrawer(user)

    expect(i18n.t('nav.menu')).not.toBe(openMenuName())
    expect(await screen.findByRole('dialog', { name: i18n.t('nav.menu') })).toBeInTheDocument()
  })
})

// Rotating an iPad from portrait to landscape crosses `lg` with the drawer
// open: the desktop shell appears with its static sidebar while the sheet, the
// backdrop, the scroll lock and the focus trap all survive on top of it, with
// the hamburger that would dismiss them now display:none.
describe('AppShell drawer across a breakpoint crossing', () => {
  it('dismisses the drawer when the viewport grows into the desktop shell', async () => {
    const user = userEvent.setup()
    setViewportWidth(375)
    await renderShell()

    await openDrawer(user)
    expect(document.body.style.overflow).toBe('hidden')

    act(() => {
      setViewportWidth(1280)
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('AppShell at 1280px — desktop appearance unchanged', () => {
  it('renders no drawer, and keeps the hamburger inside an lg:hidden top bar', async () => {
    setViewportWidth(1280)
    await renderShell()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tokens(getTopBar())).toContain('lg:hidden')
    expect(getTopBar()).toContainElement(getHamburger())
  })

  // Constraint 4 + the "extract verbatim" requirement: SidebarNav is a straight
  // lift of AppShell lines 139-276, so its rendered class output must be
  // byte-identical to today's. These are the pre-T12 strings, with T19's
  // h-screen -> h-dvh swap (AC1: no 100vh-based unit anywhere in src/) — the
  // desktop <aside> is unaffected by mobile browser chrome, so this is a pure
  // unit substitution, not a visual change (constraint 4).
  it('keeps the aside class output identical apart from the hidden / lg:flex swap and h-dvh', async () => {
    setViewportWidth(1280)
    await renderShell()

    expect(tokens(getAside())).toEqual(
      [
        'w-[240px]',
        'shrink-0',
        'border-r',
        'border-stone-200',
        'dark:border-stone-800',
        'bg-white',
        'dark:bg-stone-950',
        'hidden',
        'lg:flex',
        'flex-col',
        'h-dvh',
        'sticky',
        'top-0',
      ].sort()
    )
  })

  // T21 AC1/AC2: every one of these rows is a primary nav row in the ticket's
  // scope, and must gain EXACTLY the one `tap-safe` token — nothing else in
  // the desktop recipe may move (constraint 4 + ground truth #4: "tap-safe is
  // the ONLY class added"). Each of these elements already carries `flex` (a
  // NavLink/Link renders <a>, which is display:inline by UA default and would
  // silently ignore tap-safe's min-height/min-width without it), so none of
  // these four hits the inline-display trap — that trap is exercised by the
  // "+ New project" link below instead, which currently carries no display
  // class at all.
  it('keeps the workspace, search, project, invitations and settings classes verbatim plus tap-safe', async () => {
    setViewportWidth(1280)
    await renderShell('/')

    const aside = within(getAside())

    expect(tokens(aside.getByRole('link', { name: /Simple Project Tool/ }))).toEqual(
      'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900 tap-safe'
        .split(' ')
        .sort()
    )

    expect(tokens(aside.getByRole('button', { name: /search/i }))).toEqual(
      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-800 text-stone-400 text-ui-sm hover:bg-stone-50 dark:hover:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700 tap-safe'
        .split(' ')
        .sort()
    )

    expect(tokens(aside.getByRole('link', { name: 'Apollo' }))).toEqual(
      'flex items-center gap-2 pl-8 pr-2 py-1 text-ui-md rounded-md truncate text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 hover:text-stone-800 dark:hover:text-stone-200 tap-safe'
        .split(' ')
        .sort()
    )

    expect(tokens(aside.getByRole('link', { name: 'Invitations' }))).toEqual(
      'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 tap-safe'
        .split(' ')
        .sort()
    )

    expect(tokens(aside.getByRole('link', { name: 'Settings' }))).toEqual(
      'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-ui-md text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 tap-safe'
        .split(' ')
        .sort()
    )
  })

  // T21 AC1 — THE TRAP. "+ New project" is icon-only (17x17 measured) and is
  // rendered as a bare <Link> with NO display class today
  // (`text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5
  // rounded`) — an <a> defaults to display:inline, so adding `tap-safe` alone
  // is a silent no-op. A correct fix must add both `tap-safe` AND a display
  // class (flex/inline-flex/block/inline-block/grid) in the same change.
  it('makes the icon-only "New project" link both tap-safe and an actual flex/block box, not a no-op', async () => {
    setViewportWidth(1280)
    await renderShell('/')

    const aside = within(getAside())
    const newProjectLink = aside.getByRole('link', { name: 'New project' })

    expectTapSafeControl(newProjectLink, 'the sidebar "New project" icon link')
  })

  // T21 AC1 — the footer user-row trigger (40.8px measured, the tallest
  // under-44px control in the sidebar).
  it('makes the footer user-row trigger tap-safe', async () => {
    setViewportWidth(1280)
    await renderShell('/')

    const aside = within(getAside())
    const userRow = aside.getByRole('button', { name: /Ada Lovelace/ })

    expectTapSafeControl(userRow, 'the sidebar user-row trigger')
  })

  it('still shows the ⌘K hint on desktop', async () => {
    setViewportWidth(1280)
    await renderShell()

    expect(within(getAside()).getByText('⌘K')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Defect I4 (final whole-branch review) — ⌘K while a modal is open buries the
// palette but steals focus, Tab and Escape.
//
// AppShell.tsx's ⌘K handler is registered on `document` with no guard. Modal
// and Drawer both createPortal to document.body; CommandPalette renders
// in-place inside #root (T12/T18, deliberately not portalled). All three
// declare role="dialog" aria-modal="true" and z-index:50 in the same
// stacking context, so DOM order decides and the portal (Modal/Drawer)
// always wins visually — but ⌘K still opens the palette underneath, handing
// it focus, the topmost Tab trap and the topmost Escape handler, so a modal
// on screen stops responding to the keyboard.
//
// Both halves are required, or this is worthless: a naive "is any
// role=dialog[aria-modal=true] present" guard would also match the Drawer,
// which would silently break T12's existing "⌘K from inside the drawer
// opens the palette and closes the drawer" behaviour (asserted above, in
// 'AppShell drawer navigation at 375px' > 'closes the drawer when the
// palette is opened with the keyboard shortcut' — that test is the second
// half of this defect's coverage and is deliberately not duplicated here).
// ---------------------------------------------------------------------------

describe('AppShell command palette guard while a page Modal is open (defect I4)', () => {
  it('does not open the command palette when ⌘K is pressed while a page Modal is open', async () => {
    const user = userEvent.setup()
    setViewportWidth(1280)
    await renderShellWithModalOpen()

    await user.keyboard('{Meta>}k{/Meta}')

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('leaves the page Modal open and still the active dialog after ⌘K is pressed', async () => {
    const user = userEvent.setup()
    setViewportWidth(1280)
    await renderShellWithModalOpen()

    await user.keyboard('{Meta>}k{/Meta}')

    expect(screen.getByRole('dialog', { name: 'Edit something' })).toBeInTheDocument()
    // Exactly one dialog on screen: the guard must not have mounted the
    // (invisible-behind-it) palette at all.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })
})
