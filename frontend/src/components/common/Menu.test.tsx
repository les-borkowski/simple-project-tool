import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test/render'
import { Menu, MenuItem } from './Menu'

function renderMenu(onSelectArchive = vi.fn(), onSelectDelete = vi.fn()) {
  renderWithProviders(
    <>
      <button type="button">Before</button>
      <Menu trigger={<button aria-label="More actions">···</button>}>
        <MenuItem onSelect={onSelectArchive}>Archive</MenuItem>
        <MenuItem onSelect={onSelectDelete} destructive>
          Delete
        </MenuItem>
      </Menu>
      <button type="button">After</button>
    </>
  )
  return { onSelectArchive, onSelectDelete }
}

describe('Menu', () => {
  it('does not render its content until opened', () => {
    renderMenu()

    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('reveals its content when the trigger is clicked, with no hover involved', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'More actions' }))

    expect(await screen.findByText('Archive')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('calls the item handler and closes the menu when an item is clicked', async () => {
    const user = userEvent.setup()
    const { onSelectArchive } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByText('Archive'))

    expect(onSelectArchive).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByText('Archive')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
  })

  it('closes when clicking outside the menu', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByText('Archive')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'After' }))

    expect(screen.queryByText('Archive')).not.toBeInTheDocument()
  })

  it('exposes aria-haspopup and reflects open state via aria-expanded', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger).toHaveAttribute('aria-haspopup')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('lets keyboard users Tab from the trigger straight into the first item', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'More actions' })
    trigger.focus()
    await user.click(trigger)
    await screen.findByText('Archive')

    await user.tab()

    expect(screen.getByText('Archive')).toHaveFocus()
  })

  it('returns focus to the trigger when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'More actions' })
    trigger.focus()
    await user.click(trigger)
    await screen.findByText('Archive')
    await user.tab()

    await user.keyboard('{Escape}')

    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger when a menu item is selected', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    await user.click(await screen.findByText('Archive'))

    expect(document.activeElement).toBe(trigger)
  })

  describe('keeps the popover on screen near a viewport edge (T07 review, finding 3)', () => {
    // jsdom never computes real layout — every element's getBoundingClientRect
    // returns all-zero by default — so there is no way to reproduce actual
    // clipping in this environment. What *is* meaningfully assertable here is
    // the corrective mechanism itself: given a measured trigger box near an
    // edge and a measured panel size, the panel's fixed-position coordinates
    // land clamped inside the viewport. This is a source/behaviour assertion
    // standing in for a real-layout test, not a literal reproduction of the
    // browser bug. The panel is now portalled and positioned with `fixed`
    // top/left (not a CSS-anchored box nudged by `transform`), so the mock
    // distinguishes the trigger's box (a <button>) from the panel's own box
    // (a <div>, fixed at 140x40 here) to drive the clamping math.
    function mockTriggerRect(rect: { left: number; right: number; top: number; bottom: number }) {
      return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.tagName === 'BUTTON') {
          return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top, x: rect.left, y: rect.top, toJSON() {} }
        }
        return { left: 0, right: 140, top: 0, bottom: 40, width: 140, height: 40, x: 0, y: 0, toJSON() {} }
      })
    }

    it('clamps the panel to the left viewport margin when the trigger sits near the left edge', async () => {
      const user = userEvent.setup()
      const rectSpy = mockTriggerRect({ left: 10, right: 50, top: 100, bottom: 130 })
      renderMenu()

      await user.click(screen.getByRole('button', { name: 'More actions' }))
      const panel = (await screen.findByText('Archive')).closest('div') as HTMLElement

      // Naive right-aligned left would be 50 - 140 = -90, off screen; clamped
      // to the 8px viewport margin instead.
      expect(panel.style.left).toBe('8px')
      expect(panel.style.top).toBe('134px')
      rectSpy.mockRestore()
    })

    it('clamps the panel to the right viewport margin when the trigger sits near the right edge', async () => {
      const user = userEvent.setup()
      const originalInnerWidth = window.innerWidth
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
      const rectSpy = mockTriggerRect({ left: 980, right: 1020, top: 100, bottom: 130 })
      renderMenu()

      await user.click(screen.getByRole('button', { name: 'More actions' }))
      const panel = (await screen.findByText('Archive')).closest('div') as HTMLElement

      // Naive right-aligned left would be 1020 - 140 = 880, whose right edge
      // (1020) crosses the 1016px margin boundary (1024 - 8); clamped to
      // the maximum left that keeps the panel's right edge on screen:
      // 1024 - 8 - 140 = 876.
      expect(panel.style.left).toBe('876px')
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    })

    it('leaves the panel at its natural right-aligned position when it already fits on screen', async () => {
      const user = userEvent.setup()
      const rectSpy = mockTriggerRect({ left: 400, right: 540, top: 100, bottom: 130 })
      renderMenu()

      await user.click(screen.getByRole('button', { name: 'More actions' }))
      const panel = (await screen.findByText('Archive')).closest('div') as HTMLElement

      // Right-aligned to the trigger's right edge: 540 - 140 = 400.
      expect(panel.style.left).toBe('400px')
      expect(panel.style.top).toBe('134px')
      rectSpy.mockRestore()
    })

    it('renders the panel through a portal to document.body, outside any clipping ancestor', async () => {
      const user = userEvent.setup()
      renderMenu()

      await user.click(screen.getByRole('button', { name: 'More actions' }))
      const panel = (await screen.findByText('Archive')).closest('div') as HTMLElement

      expect(panel.parentElement).toBe(document.body)
      expect(document.body.contains(panel)).toBe(true)
    })
  })

  it('does not steal focus back to the trigger when closed by clicking another focusable element', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    await screen.findByText('Archive')

    const after = screen.getByRole('button', { name: 'After' })
    await user.click(after)

    expect(document.activeElement).toBe(after)
    expect(document.activeElement).not.toBe(trigger)
  })
})
