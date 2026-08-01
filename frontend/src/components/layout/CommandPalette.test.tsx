import { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test/render'
import i18n from '../../i18n'
import { CommandPalette } from './CommandPalette'
import { MobileTopBar } from './MobileTopBar'

// ---------------------------------------------------------------------------
// T18 — CommandPalette mobile.
//
// jsdom computes no layout (vitest.config.ts sets css: false, and jsdom itself
// never runs Tailwind or a layout engine), so `getBoundingClientRect()` is
// zeroed and a Tailwind arbitrary-value class like `pt-[10vh]` or
// `max-h-[80dvh]` has no measurable effect here. Every geometry-shaped
// assertion below is therefore a CLASS TOKEN assertion (the overlay/panel
// carries the right utility class), never a measured-pixel assertion — the
// actual 162px -> 81px offset change and the 80dvh clamp are proven by the
// separate browser measurement recorded in the ticket, not by this file.
// ---------------------------------------------------------------------------

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    searchApi: { ...actual.searchApi, search: vi.fn() },
    configApi: { ...actual.configApi, update: vi.fn() },
  }
})

import { searchApi, configApi } from '../../services/api'

beforeEach(() => {
  vi.mocked(searchApi.search).mockResolvedValue({ data: [] } as never)
  vi.mocked(configApi.update).mockResolvedValue({ data: {} } as never)
})

function renderPalette(route = '/') {
  const onClose = vi.fn()
  const view = renderWithProviders(<CommandPalette open onClose={onClose} />, { route })
  return { onClose, ...view }
}

function getDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Command palette' })
}

function tokens(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

describe('CommandPalette at 375px', () => {
  // AC1, class-token half. The desktop `md:` variant must survive so the
  // 20vh offset is unchanged at >=768px per constraint 4 — deleting it should
  // fail this test as surely as never adding `pt-[10vh]` does.
  it('keeps items-start and replaces the bare pt-[20vh] with a phone-first pt-[10vh] / md:pt-[20vh] pair', () => {
    renderPalette()

    const overlay = getDialog().parentElement as HTMLElement
    const overlayTokens = tokens(overlay)

    expect(overlayTokens).toContain('items-start')
    expect(overlayTokens).not.toContain('items-center')
    expect(overlayTokens).toContain('pt-[10vh]')
    expect(overlayTokens).toContain('md:pt-[20vh]')
    expect(overlayTokens).not.toContain('pt-[20vh]')
  })

  // AC1, panel half. The result list already scrolls internally at a fixed
  // 360px cap; this pins that the panel itself gains the 80dvh ceiling and
  // that the list is still independently scrollable underneath it.
  it('caps the panel at max-h-[80dvh] while the result list keeps its own scroll', () => {
    renderPalette()

    expect(tokens(getDialog())).toContain('max-h-[80dvh]')
    expect(tokens(screen.getByRole('listbox'))).toContain('overflow-y-auto')
  })

  // Highest-risk regression named in the brief: Escape is two-stage today via
  // a private handler on the input, and a naive migration to the shared
  // Escape stack would close on the first press instead of clearing the query
  // first.
  it('clears the query on the first Escape and leaves the palette open', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette()

    const input = screen.getByRole('textbox')
    await user.type(input, 'apollo')
    expect(input).toHaveValue('apollo')

    await user.keyboard('{Escape}')

    expect(input).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()
    expect(getDialog()).toBeInTheDocument()
  })

  it('closes the palette on Escape once the query is already empty', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette()

    screen.getByRole('textbox').focus()
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the backdrop is tapped, but not when the panel itself is tapped', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette()

    const dialog = getDialog()
    await user.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    const overlay = dialog.parentElement as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // AC2: Tab must reach the Clear button (only rendered once there is a
  // query) instead of being swallowed outright by the current
  // `if (e.key === 'Tab') e.preventDefault()` overlay handler, and it must
  // not be able to walk focus out of the palette.
  it('lets Tab reach the Clear button and wraps back to the input instead of leaving the palette', async () => {
    const user = userEvent.setup()
    renderPalette()

    const input = screen.getByRole('textbox')
    await user.type(input, 'apollo')
    const clearButton = await screen.findByRole('button', { name: 'Clear' })
    expect(document.activeElement).toBe(input)

    await user.tab()
    expect(document.activeElement).toBe(clearButton)

    await user.tab()
    expect(document.activeElement).toBe(input)
  })

  // T20 AC2 — CommandPalette's clear button is one of the two hand-reviewed
  // 16px sites in the ticket: it moves from the ad-hoc text-[16px] to the
  // text-ui-xl step (15px, a -1px shrink), which the AC calls out by name as
  // needing a human look because every other site's move is <=0.5px.
  it('sizes the Clear button with the text-ui-xl scale step, not the ad-hoc text-[16px] (T20 AC2)', async () => {
    const user = userEvent.setup()
    renderPalette()

    const input = screen.getByRole('textbox')
    await user.type(input, 'apollo')
    const clearButton = await screen.findByRole('button', { name: 'Clear' })

    expect(tokens(clearButton)).toContain('text-ui-xl')
    expect(tokens(clearButton)).not.toContain('text-[16px]')
  })

  // Regression guard: the arrow-key/Enter model (focus stays on the input;
  // rows are non-focusable role="option" divs moved by state) must survive
  // whatever change fixes the Tab handler above.
  it('still moves the highlighted option with ArrowDown/ArrowUp and activates it with Enter', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPalette('/')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowDown}')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowDown}')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowUp}')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // AC3 regression guard: the palette already opens from the T12 top-bar
  // search icon today, so this must already pass — it is here to catch a
  // wiring regression from the AC1/AC2 rework, not to drive new behaviour.
  it('opens from the top-bar search control', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <MobileTopBar
            drawerOpen={false}
            drawerId="mobile-drawer"
            onOpenDrawer={() => {}}
            onOpenSearch={() => setOpen(true)}
          />
          <CommandPalette open={open} onClose={() => setOpen(false)} />
        </>
      )
    }

    renderWithProviders(<Harness />)

    await user.click(screen.getByRole('button', { name: i18n.t('shell.search') }))

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })
})

describe('CommandPalette at >=768px — desktop appearance unchanged', () => {
  // Constraint 4, made concrete: the desktop half of the pt- pair must be the
  // exact string in use today, so nothing shifts at the md breakpoint.
  it('keeps the exact pre-T18 md:pt-[20vh] token', () => {
    renderPalette()

    const overlay = getDialog().parentElement as HTMLElement
    expect(tokens(overlay)).toContain('md:pt-[20vh]')
  })
})
