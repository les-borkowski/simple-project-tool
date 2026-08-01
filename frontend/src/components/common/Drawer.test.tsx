import { useState } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, waitFor } from '../../test/render'
import { Drawer } from './Drawer'

// ---------------------------------------------------------------------------
// T12: `Drawer` is the left-anchored sibling of `Modal`. It reuses the same
// T03/T08 hooks (useFocusTrap, useEscapeKey, useBodyScrollLock) and the same
// portal + backdrop-guard structure, so the contract asserted here is
// deliberately Modal's contract, re-stated for a left sheet.
//
// Public API under test:
//
//   <Drawer
//     open={boolean}
//     onClose={() => void}
//     title="string"      // accessible name of the dialog (aria-labelledby)
//     id="string"         // applied to the dialog element, so the trigger's
//                         // aria-controls can point at it
//   >
//     {children}
//   </Drawer>
//
// The `id` prop exists because the hamburger in `MobileTopBar` must carry an
// `aria-controls` that resolves to this element; a `useId` generated inside
// Drawer could not be read by the trigger.
//
// jsdom computes no layout (vitest `css: false`), so "left-anchored" is a class
// assertion, never a measured position.
// ---------------------------------------------------------------------------

function DrawerHarness({
  onClose = vi.fn(),
  title = 'Navigation',
  id,
  children,
}: {
  onClose?: () => void
  title?: string
  id?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        Open drawer
      </button>
      <button type="button">Background button</button>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        title={title}
        id={id}
      >
        {children ?? <button type="button">Drawer button</button>}
      </Drawer>
    </div>
  )
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open drawer' }))
  return screen.findByRole('dialog')
}

describe('Drawer', () => {
  // R3: a drawer that stayed mounted and merely translated off-screen would put
  // a second full copy of the navigation in the tab order at every width.
  it('renders nothing at all while closed', () => {
    renderWithProviders(
      <DrawerHarness>
        <a href="/projects">Projects</a>
      </DrawerHarness>
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
  })

  it('shows its contents once opened', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DrawerHarness>
        <a href="/projects">Projects</a>
      </DrawerHarness>
    )

    await openDrawer(user)

    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument()
  })

  it('exposes a modal dialog with an accessible name taken from its title', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness title="Main menu" />)

    await user.click(screen.getByRole('button', { name: 'Open drawer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Main menu' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)).toHaveTextContent('Main menu')
  })

  it('applies the given id to the dialog so a trigger can aria-control it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness id="app-drawer" />)

    const dialog = await openDrawer(user)

    expect(dialog).toHaveAttribute('id', 'app-drawer')
    expect(document.getElementById('app-drawer')).toBe(dialog)
  })

  it('renders through a portal on document.body, outside any clipping ancestor', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    const dialog = await openDrawer(user)
    const overlay = dialog.parentElement as HTMLElement

    expect(overlay.parentElement).toBe(document.body)
  })

  it('anchors the panel to the left edge rather than centring it like Modal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    const dialog = await openDrawer(user)
    const overlay = dialog.parentElement as HTMLElement

    // Either the overlay packs its child to the start, or the panel pins itself
    // to the left edge. Both are legitimate ways to anchor left; centring is
    // not.
    expect(`${overlay.className} ${dialog.className}`).toMatch(/\b(justify-start|left-0|mr-auto)\b/)
    expect(overlay.className).not.toContain('justify-center')
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<DrawerHarness onClose={onClose} />)

    await openDrawer(user)
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes when the backdrop is tapped', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<DrawerHarness onClose={onClose} />)

    const dialog = await openDrawer(user)
    await user.click(dialog.parentElement as HTMLElement)

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('does not close when the panel itself is tapped', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<DrawerHarness onClose={onClose} />)

    const dialog = await openDrawer(user)
    await user.click(dialog)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // Mirrors Modal's `e.target === e.currentTarget` mousedown guard: a drag that
  // starts on a nav item and overshoots onto the backdrop must not dismiss.
  it('does not close when a drag started inside the panel is released on the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<DrawerHarness onClose={onClose} />)

    const dialog = await openDrawer(user)
    const overlay = dialog.parentElement as HTMLElement

    await user.pointer([
      { keys: '[MouseLeft>]', target: dialog },
      { target: overlay },
      { keys: '[/MouseLeft]', target: overlay },
    ])

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('moves focus inside the drawer when it opens', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    const dialog = await openDrawer(user)

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
  })

  it('traps Tab inside the drawer instead of letting it reach the page behind', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DrawerHarness>
        <a href="/a">First link</a>
        <a href="/b">Second link</a>
      </DrawerHarness>
    )

    const dialog = await openDrawer(user)

    for (let i = 0; i < 4; i += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  // Matches Modal's panel: the sheet reaches the bottom edge, so its last
  // control would otherwise sit in the home-indicator gesture strip. Inert
  // until index.html gains `viewport-fit=cover` (T19).
  it('keeps its bottom controls clear of the home indicator', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    const dialog = await openDrawer(user)

    expect(dialog.className).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('wraps Tab from the last item back to the first', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <DrawerHarness>
        <a href="/a">First link</a>
        <a href="/b">Second link</a>
      </DrawerHarness>
    )

    await openDrawer(user)
    const first = screen.getByRole('link', { name: 'First link' })
    const second = screen.getByRole('link', { name: 'Second link' })

    second.focus()
    await user.tab()

    expect(document.activeElement).toBe(first)
  })

  it('restores focus to the trigger when it closes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    const trigger = screen.getByRole('button', { name: 'Open drawer' })
    await openDrawer(user)
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('locks body scroll while open and releases it on close', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DrawerHarness />)

    expect(document.body.style.overflow).not.toBe('hidden')

    await openDrawer(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })
})
