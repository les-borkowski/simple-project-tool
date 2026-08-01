import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { MobileTopBar } from './MobileTopBar'
import { PageHeader } from './PageHeader'

// T19 — dvh + safe-area sweep.
//
// --spacing-topbar (src/index.css) is load-bearing in two places at once:
//   - MobileTopBar's box HEIGHT      -> the `h-topbar` class
//   - PageHeader's sticky OFFSET     -> the `top-topbar` class
// If the top bar grows (e.g. to clear a notch) and PageHeader's sticky
// offset does not grow by the same amount, the header slides under the
// taller top bar on a notched device.
//
// src/index.css.test.ts pins the token's own value; this test pins the
// *coupling*: both consumers must resolve from the SAME named token (the
// literal string "topbar"), rendered in a single test, so a future edit that
// hardcodes one side (e.g. `top-12` or `h-12`) instead of the shared token
// fails here even though each component's own test file might not catch a
// divergence between the two.
//
// jsdom computes no layout, so this is a class-token assertion, not a
// measured-offset one.

describe('MobileTopBar height and PageHeader sticky offset share one token (T19)', () => {
  it('both resolve the "topbar" token, not independent hardcoded values', () => {
    renderWithProviders(
      <>
        <MobileTopBar drawerOpen={false} drawerId="drawer-id" onOpenDrawer={vi.fn()} onOpenSearch={vi.fn()} />
        <PageHeader title="Projects" />
      </>,
    )

    const topBar = screen.getByRole('banner')
    expect(
      Array.from(topBar.classList),
      'MobileTopBar must size its box from h-topbar',
    ).toContain('h-topbar')

    const heading = screen.getByRole('heading', { name: 'Projects' })
    const header = heading.closest('.border-b') as HTMLElement
    expect(header, 'expected PageHeader to render its bordered header container').not.toBeNull()
    expect(
      Array.from(header.classList),
      'PageHeader must offset its sticky position from top-topbar, the same --spacing-topbar token ' +
        'MobileTopBar sizes its height from',
    ).toContain('top-topbar')
  })
})
