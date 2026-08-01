import { useState } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { tabId } from '../../utils/tabId'
import { Tabs } from './Tabs'

// ---------------------------------------------------------------------------
// Public API under test (T10):
//
//   <Tabs
//     items={[{ key, label, icon?, disabled? }, ...]}
//     value={string}                       // the active tab's key (controlled)
//     onChange={(key: string) => void}     // fired on click, Arrow, Home, End
//     label={string}                       // accessible name of the tablist
//     orientation?={'horizontal' | 'vertical-lg'}   // default 'horizontal'
//     panelId?={string}                    // aria-controls target of the selected tab
//     className?={string}                  // extra classes on the tablist element
//   />
//
// Two deliberate API decisions this file pins down, both from the WAI-ARIA tabs
// pattern, so the implementer does not have to guess:
//
//  1. AUTOMATIC ACTIVATION. Arrow/Home/End move focus *and* select, in one step.
//     That is the APG default for tab lists whose panels are cheap to render,
//     and it is what makes AC2 ("changing the active tab scrolls it into view")
//     fall out of keyboard use rather than needing a separate Enter press.
//  2. DISABLED TABS USE aria-disabled, NOT the native `disabled` attribute.
//     A natively-disabled button cannot be focused at all, so a keyboard user
//     never discovers it exists. aria-disabled keeps it announced while arrow
//     navigation skips over it and activation is refused.
//
// jsdom computes no layout — getBoundingClientRect() is all zeros and Tailwind
// classes are never resolved. So every "scrolls horizontally / stacks
// vertically / does not overflow at 320px" claim below is asserted as class
// tokens on the rendered element, never as measured geometry. Those are flagged
// in the T10 report as needing the browser pass.
// ---------------------------------------------------------------------------

interface Item {
  key: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

const BASIC: Item[] = [
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
]

const MIDDLE_DISABLED: Item[] = [
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta', disabled: true },
  { key: 'gamma', label: 'Gamma' },
]

const FIRST_DISABLED: Item[] = [
  { key: 'alpha', label: 'Alpha', disabled: true },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
]

const ALL_DISABLED: Item[] = [
  { key: 'alpha', label: 'Alpha', disabled: true },
  { key: 'beta', label: 'Beta', disabled: true },
]

const LAST_DISABLED: Item[] = [
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma', disabled: true },
]

// Same tabs as BASIC, in the opposite order: the active tab can be pushed
// off-screen by a reorder alone, without `value` ever changing.
const REORDERED: Item[] = [BASIC[2], BASIC[1], BASIC[0]]

function TabsHarness({
  items = BASIC,
  initial,
  orientation,
  onChange,
  label = 'Sections',
}: {
  items?: Item[]
  initial?: string
  orientation?: 'horizontal' | 'vertical-lg'
  onChange?: (key: string) => void
  label?: string
}) {
  const [value, setValue] = useState(initial ?? items[0].key)
  return (
    <div>
      <button type="button">Before</button>
      <Tabs
        items={items}
        value={value}
        onChange={(key: string) => {
          setValue(key)
          onChange?.(key)
        }}
        label={label}
        orientation={orientation}
        panelId="section-panel"
      />
      <div id="section-panel" role="tabpanel">
        {value} panel
      </div>
      <button type="button">After</button>
    </div>
  )
}

function tab(name: string): HTMLElement {
  return screen.getByRole('tab', { name })
}

// Roving tabindex allows exactly one tab stop, so assertions read better as a
// list of the tabs currently in the page tab order.
function tabStops(): HTMLElement[] {
  return screen.getAllByRole('tab').filter((el) => el.tabIndex === 0)
}

function tokensOf(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

describe('Tabs', () => {
  describe('tab semantics', () => {
    it('exposes a tablist carrying the accessible name it was given', () => {
      renderWithProviders(<TabsHarness label="Settings sections" />)

      expect(screen.getByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument()
    })

    it('renders one tab per item, each named by its label', () => {
      renderWithProviders(<TabsHarness />)

      expect(screen.getAllByRole('tab')).toHaveLength(3)
      expect(tab('Alpha')).toBeInTheDocument()
      expect(tab('Beta')).toBeInTheDocument()
      expect(tab('Gamma')).toBeInTheDocument()
    })

    it('keeps the label readable when the item also carries an icon', () => {
      renderWithProviders(
        <TabsHarness
          items={[
            { key: 'alpha', label: 'Alpha', icon: <svg aria-hidden="true" /> },
            { key: 'beta', label: 'Beta' },
          ]}
        />
      )

      expect(screen.getByRole('tab', { name: 'Alpha' })).toBeInTheDocument()
    })

    it('marks only the active tab as selected', () => {
      renderWithProviders(<TabsHarness initial="beta" />)

      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'false')
      expect(tab('Beta')).toHaveAttribute('aria-selected', 'true')
      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'false')
    })

    it('moves the selected marker when another tab is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness />)

      await user.click(tab('Gamma'))

      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'true')
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tabpanel')).toHaveTextContent('gamma panel')
    })

    it('points the selected tab at the panel it controls', () => {
      renderWithProviders(<TabsHarness initial="beta" />)

      expect(tab('Beta')).toHaveAttribute('aria-controls', 'section-panel')
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'section-panel')
    })

    it('gives every tab a unique id so a panel can be labelled by the active one', () => {
      renderWithProviders(<TabsHarness />)

      const ids = screen.getAllByRole('tab').map((el) => el.id)

      expect(ids.every((id) => id.length > 0)).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('namespaces its tab ids on idPrefix, still pointing aria-controls at the panel', () => {
      renderWithProviders(
        <Tabs
          items={BASIC}
          value="beta"
          onChange={vi.fn()}
          label="Sections"
          panelId="section-panel"
          idPrefix="sections"
        />
      )

      expect(tab('Beta')).toHaveAttribute('id', tabId('sections', 'beta'))
      expect(tab('Beta')).toHaveAttribute('aria-controls', 'section-panel')
    })

    it('keeps tab ids unique across two tablists that share one panel id', () => {
      // Deriving tab ids from panelId puts two tablists in one namespace, so the
      // first pair of tabs with matching keys silently duplicates a DOM id and
      // aria-labelledby resolves to whichever came first.
      renderWithProviders(
        <div>
          <Tabs items={BASIC} value="alpha" onChange={vi.fn()} label="First" panelId="shared" />
          <Tabs items={BASIC} value="alpha" onChange={vi.fn()} label="Second" panelId="shared" />
        </div>
      )

      const ids = screen.getAllByRole('tab').map((el) => el.id)

      expect(ids).toHaveLength(6)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('renders tabs as buttons that never submit a surrounding form', () => {
      renderWithProviders(<TabsHarness />)

      for (const el of screen.getAllByRole('tab')) {
        expect(el.tagName).toBe('BUTTON')
        expect(el).toHaveAttribute('type', 'button')
      }
    })
  })

  describe('roving tabindex', () => {
    it('puts exactly the active tab in the page tab order', () => {
      renderWithProviders(<TabsHarness initial="beta" />)

      expect(tab('Alpha')).toHaveAttribute('tabindex', '-1')
      expect(tab('Beta')).toHaveAttribute('tabindex', '0')
      expect(tab('Gamma')).toHaveAttribute('tabindex', '-1')
    })

    it('moves the single tab stop when the active tab changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness />)

      await user.click(tab('Gamma'))

      expect(tab('Gamma')).toHaveAttribute('tabindex', '0')
      expect(screen.getAllByRole('tab').filter((el) => el.tabIndex === 0)).toHaveLength(1)
    })

    it('keeps a tab stop when the active tab is disabled, moving it to the first enabled tab', () => {
      renderWithProviders(<TabsHarness items={FIRST_DISABLED} initial="alpha" />)

      // The tablist must stay reachable by Tab, but selection is the parent's
      // to decide: aria-selected still follows `value` exactly.
      expect(tabStops()).toEqual([tab('Beta')])
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'true')
    })

    it('keeps a tab stop when the active key matches no item, using the first enabled tab', () => {
      renderWithProviders(<TabsHarness items={MIDDLE_DISABLED} initial="delta" />)

      expect(tabStops()).toEqual([tab('Alpha')])
      for (const el of screen.getAllByRole('tab')) {
        expect(el).toHaveAttribute('aria-selected', 'false')
      }
    })

    it('puts the single tab stop on the active tab in the ordinary case', () => {
      renderWithProviders(<TabsHarness initial="beta" />)

      expect(tabStops()).toEqual([tab('Beta')])
    })

    it('renders a tablist whose tabs are all disabled without crashing', () => {
      renderWithProviders(<TabsHarness items={ALL_DISABLED} />)

      expect(screen.getAllByRole('tab')).toHaveLength(2)
      expect(tabStops()).toEqual([])
    })

    it('lands on the active tab after one Tab press from the control before it', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness initial="gamma" />)

      screen.getByRole('button', { name: 'Before' }).focus()
      await user.tab()

      expect(document.activeElement).toBe(tab('Gamma'))
    })

    it('leaves the whole tablist on the next Tab press rather than stepping tab by tab', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness />)

      tab('Alpha').focus()
      await user.tab()

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
    })
  })

  describe('keyboard navigation in a horizontal tablist', () => {
    it('activates the next tab on ArrowRight', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness onChange={onChange} />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowRight}')

      expect(onChange).toHaveBeenCalledWith('beta')
      expect(document.activeElement).toBe(tab('Beta'))
      expect(tab('Beta')).toHaveAttribute('aria-selected', 'true')
    })

    it('activates the previous tab on ArrowLeft', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness initial="gamma" onChange={onChange} />)

      tab('Gamma').focus()
      await user.keyboard('{ArrowLeft}')

      expect(onChange).toHaveBeenCalledWith('beta')
      expect(document.activeElement).toBe(tab('Beta'))
    })

    it('wraps from the last tab to the first on ArrowRight', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness initial="gamma" />)

      tab('Gamma').focus()
      await user.keyboard('{ArrowRight}')

      expect(document.activeElement).toBe(tab('Alpha'))
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'true')
    })

    it('wraps from the first tab to the last on ArrowLeft', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowLeft}')

      expect(document.activeElement).toBe(tab('Gamma'))
      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'true')
    })

    it('jumps to the first tab on Home', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness initial="gamma" />)

      tab('Gamma').focus()
      await user.keyboard('{Home}')

      expect(document.activeElement).toBe(tab('Alpha'))
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'true')
    })

    it('jumps to the last tab on End', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness />)

      tab('Alpha').focus()
      await user.keyboard('{End}')

      expect(document.activeElement).toBe(tab('Gamma'))
      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'true')
    })

    it('ignores ArrowDown and ArrowUp in a horizontal tablist, leaving page scroll alone', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness onChange={onChange} />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowDown}{ArrowUp}')

      expect(onChange).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(tab('Alpha'))
    })
  })

  describe('disabled tabs', () => {
    it('announces a disabled tab as disabled without removing it from the accessibility tree', () => {
      renderWithProviders(<TabsHarness items={MIDDLE_DISABLED} />)

      expect(tab('Beta')).toHaveAttribute('aria-disabled', 'true')
    })

    it('keeps a disabled tab out of the tab order', () => {
      renderWithProviders(<TabsHarness items={MIDDLE_DISABLED} />)

      expect(tab('Beta')).toHaveAttribute('tabindex', '-1')
    })

    it('refuses to activate a disabled tab when it is clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness items={MIDDLE_DISABLED} onChange={onChange} />)

      await user.click(tab('Beta'))

      expect(onChange).not.toHaveBeenCalled()
      expect(tab('Beta')).toHaveAttribute('aria-selected', 'false')
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tabpanel')).toHaveTextContent('alpha panel')
    })

    it('skips a disabled tab when arrowing forwards', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness items={MIDDLE_DISABLED} onChange={onChange} />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowRight}')

      expect(onChange).toHaveBeenCalledWith('gamma')
      expect(document.activeElement).toBe(tab('Gamma'))
    })

    it('skips a disabled tab when arrowing backwards', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      renderWithProviders(
        <TabsHarness items={MIDDLE_DISABLED} initial="gamma" onChange={onChange} />
      )

      tab('Gamma').focus()
      await user.keyboard('{ArrowLeft}')

      expect(onChange).toHaveBeenCalledWith('alpha')
      expect(document.activeElement).toBe(tab('Alpha'))
    })

    it('skips a disabled tab while wrapping round the end of the list', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness items={LAST_DISABLED} initial="beta" />)

      tab('Beta').focus()
      await user.keyboard('{ArrowRight}')

      expect(document.activeElement).toBe(tab('Alpha'))
      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'false')
    })

    it('sends Home to the first enabled tab when the first tab is disabled', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness items={FIRST_DISABLED} initial="gamma" />)

      tab('Gamma').focus()
      await user.keyboard('{Home}')

      expect(document.activeElement).toBe(tab('Beta'))
      expect(tab('Alpha')).toHaveAttribute('aria-selected', 'false')
    })

    it('sends End to the last enabled tab when the last tab is disabled', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TabsHarness items={LAST_DISABLED} />)

      tab('Alpha').focus()
      await user.keyboard('{End}')

      expect(document.activeElement).toBe(tab('Beta'))
      expect(tab('Gamma')).toHaveAttribute('aria-selected', 'false')
    })
  })

  describe('scrolling the active tab into view', () => {
    it('scrolls a tab activated by keyboard into view, so an off-screen tab is reachable', async () => {
      const user = userEvent.setup()
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      renderWithProviders(<TabsHarness />)

      tab('Alpha').focus()
      scrollIntoView.mockClear()
      await user.keyboard('{End}')

      expect(scrollIntoView).toHaveBeenCalled()
      expect(scrollIntoView.mock.contexts).toContain(tab('Gamma'))
    })

    it('scrolls a tab activated by pointer into view', async () => {
      const user = userEvent.setup()
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      renderWithProviders(<TabsHarness />)

      scrollIntoView.mockClear()
      await user.click(tab('Gamma'))

      expect(scrollIntoView.mock.contexts).toContain(tab('Gamma'))
    })

    it('scrolls the new tab into view when the parent changes the active tab', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      const onChange = vi.fn()
      const view = renderWithProviders(
        <Tabs items={BASIC} value="alpha" onChange={onChange} label="Sections" />
      )

      scrollIntoView.mockClear()
      view.rerender(<Tabs items={BASIC} value="gamma" onChange={onChange} label="Sections" />)

      expect(scrollIntoView.mock.contexts).toContain(tab('Gamma'))
    })

    it('scrolls only along the tab strip, so the page does not jump vertically', async () => {
      const user = userEvent.setup()
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      renderWithProviders(<TabsHarness />)

      scrollIntoView.mockClear()
      await user.click(tab('Gamma'))

      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'nearest', inline: 'nearest' })
      )
    })

    it('scrolls the active tab back into view when the items around it are reordered', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      const onChange = vi.fn()
      const view = renderWithProviders(
        <Tabs items={BASIC} value="alpha" onChange={onChange} label="Sections" />
      )

      scrollIntoView.mockClear()
      view.rerender(<Tabs items={REORDERED} value="alpha" onChange={onChange} label="Sections" />)

      expect(scrollIntoView.mock.contexts).toContain(tab('Alpha'))
    })

    it('scrolls the active tab back into view when a hidden tab is revealed before it', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      const onChange = vi.fn()
      const view = renderWithProviders(
        <Tabs items={BASIC.slice(1)} value="gamma" onChange={onChange} label="Sections" />
      )

      scrollIntoView.mockClear()
      view.rerender(<Tabs items={BASIC} value="gamma" onChange={onChange} label="Sections" />)

      expect(scrollIntoView.mock.contexts).toContain(tab('Gamma'))
    })

    // Note this pins the *identity* of `items` as well as `value`: a caller that
    // rebuilds its item array on every render re-scrolls on every render.
    it('does not scroll on a re-render that leaves the active tab unchanged', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
      const onChange = vi.fn()
      const view = renderWithProviders(
        <Tabs items={BASIC} value="alpha" onChange={onChange} label="Sections" />
      )

      scrollIntoView.mockClear()
      view.rerender(<Tabs items={BASIC} value="alpha" onChange={onChange} label="Sections" />)

      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })

  // orientation="vertical-lg": a horizontal pill scroller below lg, a vertical
  // nav at lg+. The layout half is CSS variants only (asserted as class tokens);
  // the aria-orientation half is semantics, and is the one thing here that
  // legitimately reads a media query.
  describe('orientation="vertical-lg"', () => {
    it('reports a vertical orientation on the desktop shell', () => {
      setViewportWidth(1280)
      renderWithProviders(<TabsHarness orientation="vertical-lg" />)

      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')
    })

    it('reports a horizontal orientation on a phone, where it renders as a pill row', () => {
      setViewportWidth(375)
      renderWithProviders(<TabsHarness orientation="vertical-lg" />)

      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
    })

    it('activates the next tab on ArrowDown', async () => {
      const user = userEvent.setup()
      setViewportWidth(1280)
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness orientation="vertical-lg" onChange={onChange} />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowDown}')

      expect(onChange).toHaveBeenCalledWith('beta')
      expect(document.activeElement).toBe(tab('Beta'))
    })

    it('wraps from the first tab to the last on ArrowUp', async () => {
      const user = userEvent.setup()
      setViewportWidth(1280)
      renderWithProviders(<TabsHarness orientation="vertical-lg" />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowUp}')

      expect(document.activeElement).toBe(tab('Gamma'))
    })

    it('still answers ArrowRight on a phone, where the same tabs are a horizontal row', async () => {
      const user = userEvent.setup()
      setViewportWidth(375)
      const onChange = vi.fn()
      renderWithProviders(<TabsHarness orientation="vertical-lg" onChange={onChange} />)

      tab('Alpha').focus()
      await user.keyboard('{ArrowRight}')

      expect(onChange).toHaveBeenCalledWith('beta')
      expect(document.activeElement).toBe(tab('Beta'))
    })

    it('skips a disabled tab on ArrowDown too', async () => {
      const user = userEvent.setup()
      setViewportWidth(1280)
      const onChange = vi.fn()
      renderWithProviders(
        <TabsHarness orientation="vertical-lg" items={MIDDLE_DISABLED} onChange={onChange} />
      )

      tab('Alpha').focus()
      await user.keyboard('{ArrowDown}')

      expect(onChange).toHaveBeenCalledWith('gamma')
      expect(document.activeElement).toBe(tab('Gamma'))
    })
  })

  // jsdom resolves no CSS, so these are class-token assertions. They cannot
  // prove "nothing overflows at 320px"; they prove the recipe that makes it
  // true is present, and they fail loudly if it is replaced by a fixed column.
  describe('layout recipe (class-presence only — needs the browser pass)', () => {
    it('lays a horizontal tablist out as a scrollable row', () => {
      setViewportWidth(320)
      renderWithProviders(<TabsHarness />)

      const tokens = tokensOf(screen.getByRole('tablist'))

      expect(tokens).toContain('flex')
      expect(tokens, 'a phone tab strip must scroll rather than overflow').toContain(
        'overflow-x-auto'
      )
    })

    it('stops individual tabs squashing or wrapping in the scroller', () => {
      setViewportWidth(320)
      renderWithProviders(<TabsHarness />)

      for (const el of screen.getAllByRole('tab')) {
        const tokens = tokensOf(el)
        expect(tokens, `"${el.textContent}" must not shrink in the scroller`).toContain('shrink-0')
        expect(tokens, `"${el.textContent}" must not wrap its label`).toContain('whitespace-nowrap')
      }
    })

    // Class presence only: this cannot prove the ring is *visible*. What it does
    // prove is that the indicator is asked for inside the tab's own box, where
    // the tablist's overflow clip cannot reach it — unlike `.focus-ring`, which
    // paints 3px outside the border box of a scroller with no padding.
    it('asks for a focus indicator drawn inside the tab rather than outside it', () => {
      renderWithProviders(<TabsHarness />)

      for (const el of screen.getAllByRole('tab')) {
        const tokens = tokensOf(el)
        expect(
          tokens,
          `"${el.textContent}" must not rely on a ring painted outside its border box`
        ).not.toContain('focus-ring')
        expect(tokens, `"${el.textContent}" needs a visible focus indicator`).toContain(
          'focus:outline-2'
        )
        expect(tokens, `"${el.textContent}" must inset that indicator`).toContain(
          'focus:-outline-offset-2'
        )
      }
    })

    it('renders vertical-lg as a scrolling row below lg and a column at lg and up', () => {
      setViewportWidth(320)
      renderWithProviders(<TabsHarness orientation="vertical-lg" />)

      const tablist = screen.getByRole('tablist')
      const tokens = tokensOf(tablist)

      expect(tokens, 'below lg it is a horizontal pill scroller').toContain('overflow-x-auto')
      expect(tokens, 'below lg it is a row').toContain('flex-row')
      expect(tokens, 'at lg+ it becomes the vertical nav').toContain('lg:flex-col')
      expect(
        tablist.className,
        'the horizontal scroller must be switched off at lg so the desktop nav is unchanged'
      ).toMatch(/\blg:overflow-(x-)?visible\b/)
    })

    it('renders identical markup at 320px and 1280px, proving the layout switch is CSS-only', () => {
      // aria-orientation is semantics, not layout, and is allowed to differ;
      // useId counters never reset between mounts, so ids differ too. Normalise
      // both and compare the rest verbatim.
      const normalise = (html: string) =>
        html
          .replace(/aria-orientation="[^"]*"/g, 'aria-orientation="X"')
          .replace(/(id|aria-controls|aria-labelledby)="[^"]*"/g, '$1="X"')

      setViewportWidth(320)
      const phone = renderWithProviders(<TabsHarness orientation="vertical-lg" />)
      const phoneHtml = normalise(screen.getByRole('tablist').outerHTML)
      phone.unmount()

      setViewportWidth(1280)
      renderWithProviders(<TabsHarness orientation="vertical-lg" />)
      const desktopHtml = normalise(screen.getByRole('tablist').outerHTML)

      expect(desktopHtml).toBe(phoneHtml)
    })
  })
})
