import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { MobileTopBar } from './MobileTopBar'

// T19 — dvh + safe-area sweep, AC2: the mobile top bar carries
// env(safe-area-inset-top) padding so its content clears a device notch.
//
// The bar's *box* stays h-topbar (the token itself grows via
// --spacing-topbar, see src/index.css.test.ts); its *content* additionally
// needs top padding so a taller box does not just push the hamburger further
// under the notch. jsdom computes no layout and never resolves env(), so this
// is asserted as a class-token assertion, following the style already used
// for this header at AppShell.drawer.test.tsx:152 ('for token of [...]').

function renderTopBar() {
  return renderWithProviders(
    <MobileTopBar
      drawerOpen={false}
      drawerId="drawer-id"
      onOpenDrawer={vi.fn()}
      onOpenSearch={vi.fn()}
    />,
  )
}

describe('MobileTopBar safe-area padding (T19 AC2)', () => {
  it('pads its content below the top safe-area inset (notch)', () => {
    renderTopBar()

    const header = screen.getByRole('banner')
    expect(
      Array.from(header.classList),
      'Expected the top bar header to carry pt-[env(safe-area-inset-top)] so its hamburger/search ' +
        'controls sit below a device notch once the box itself grows to clear it.',
    ).toContain('pt-[env(safe-area-inset-top)]')
  })

  it('still sizes its box from the shared --spacing-topbar token', () => {
    renderTopBar()

    const header = screen.getByRole('banner')
    expect(Array.from(header.classList)).toContain('h-topbar')
  })
})
