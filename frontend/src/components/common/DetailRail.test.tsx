import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen, within } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { expectTapSafeControl } from '../../test/tapSafeRecipe'
import { DetailField } from './DetailField'
import { DetailRail } from './DetailRail'

// ---------------------------------------------------------------------------
// Public API under test (T11):
//
//   <DetailRail
//     label={string}                 // accessible name of the rail landmark AND
//                                    // the label of the mobile "Details" disclosure
//     secondary?={{                  // a SECOND section (status history), which is
//       label: string                // collapsed by default below lg and always
//       children: ReactNode          // open at lg+
//     }}
//   >
//     {fields}                       // the <DetailField> rows
//   </DetailRail>
//
// It renders an <aside>.
//
// TWO API DECISIONS THIS FILE PINS DOWN, so the implementer does not have to
// guess:
//
//  1. THE DISCLOSURE TOGGLE IS A <button> CARRYING aria-expanded /
//     aria-controls, NOT a native <details>/<summary>. A native <summary> is
//     mapped by this stack (aria-query + dom-accessibility-api, verified) to no
//     role at all, and its text does not become the accessible name of the
//     surrounding <details> "group" — so a screen-reader user gets an unnamed
//     group with an unlabelled twisty. An explicit button is announced as
//     "Status History, collapsed, button".
//
//  2. BELOW lg THE RAIL RENDERS DISCLOSURE TOGGLES; AT lg IT RENDERS NONE.
//     Collapsing is a *behavioural* branch — the collapsed panel has to leave
//     the accessibility tree, which a CSS variant cannot do — so per the plan's
//     discipline rule this is the one thing here allowed to read
//     `useMediaQuery`. It is also what keeps AC1 honest: at 1280px there is no
//     extra affordance in the rail, so the desktop rail looks exactly as it
//     does today.
//
//     Everything else — the border side, the field columns, the order flip — is
//     LAYOUT and must be CSS variants only. The "identical markup at 375px and
//     1280px" tests below are what hold that line.
//
// jsdom computes no layout: getBoundingClientRect() is all zeros and Tailwind
// classes are never resolved to styles. So "lays its fields two across",
// "appears above the main content" and "draws its rule at the bottom" are
// asserted as exact class tokens read off `classList` (so `border-b` cannot
// match inside `lg:border-b-0`), never as measured geometry. Those are flagged
// in the T11 report as structurally-only covered.
// ---------------------------------------------------------------------------

// The <aside> as it renders today at StoryDetailPage.tsx:366. AC1 says the rail
// must still be this at 1280px. `border-l` is deliberately absent from this list
// and handled separately: it becomes `lg:border-l`, which is the one sanctioned
// change (it also fixes the rule dangling down the mobile layout today).
const TODAYS_ASIDE_TOKENS = [
  'border-stone-200',
  'dark:border-stone-800',
  'bg-stone-50/40',
  'dark:bg-stone-950/30',
  'px-5',
  'py-5',
  'space-y-5',
  'text-ui-md',
]

function Fields() {
  return (
    <>
      <DetailField label="Status">
        <select aria-label="Status" defaultValue="todo">
          <option value="todo">To Do</option>
          <option value="done">Done</option>
        </select>
      </DetailField>
      <DetailField label="Priority">
        <select aria-label="Priority" defaultValue="medium">
          <option value="medium">Medium</option>
        </select>
      </DetailField>
      <DetailField label="Project">
        <span>Apollo</span>
      </DetailField>
      <DetailField label="Created">
        <span>2h ago</span>
      </DetailField>
    </>
  )
}

const HISTORY: { label: string; children: ReactNode } = {
  label: 'Status History',
  children: <p>Moved to Done</p>,
}

// `secondary: null` means "render the rail with no second section". A literal
// `undefined` would be swallowed by the default below, so the absence case gets
// its own sentinel.
function renderRail({
  width = 1280,
  secondary = HISTORY,
}: {
  width?: number
  secondary?: { label: string; children: ReactNode } | null
} = {}) {
  setViewportWidth(width)
  const view = renderWithProviders(
    <DetailRail label="Details" secondary={secondary ?? undefined}>
      <Fields />
    </DetailRail>
  )
  const rail = view.container.querySelector('aside')
  expect(rail, 'DetailRail must render an <aside>').not.toBeNull()
  return { ...view, rail: rail as HTMLElement }
}

function tokensOf(element: HTMLElement): string[] {
  return Array.from(element.classList)
}

/** A single DetailField row, located by its label. */
function fieldRow(rail: HTMLElement, label: string): HTMLElement {
  const row = within(rail).getByText(label).closest('div')
  expect(row, `expected the ${label} label to sit inside a field row`).not.toBeNull()
  return row as HTMLElement
}

/** The element that directly contains the DetailField rows. */
function fieldsContainer(rail: HTMLElement): HTMLElement {
  const firstField = fieldRow(rail, 'Status').parentElement
  expect(firstField, 'expected the Status field to sit inside a container').not.toBeNull()
  return firstField as HTMLElement
}

/** Every disclosure toggle inside the rail, identified by aria-expanded. */
function togglesIn(rail: HTMLElement): HTMLElement[] {
  return within(rail)
    .queryAllByRole('button')
    .filter((el) => el.hasAttribute('aria-expanded'))
}

function toggle(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

// useId counters are global and never reset between mounts, so generated ids
// say nothing about layout and are normalised before any markup comparison.
function normalise(html: string): string {
  return html.replace(/(id|aria-controls|aria-labelledby|aria-describedby)="[^"]*"/g, '$1="X"')
}

describe('DetailRail', () => {
  describe('desktop regression lock (AC1)', () => {
    it('keeps every class the story rail carries today', () => {
      const { rail } = renderRail({ width: 1280 })

      expect(tokensOf(rail)).toEqual(expect.arrayContaining(TODAYS_ASIDE_TOKENS))
    })

    it('drops the unprefixed border-l that dangles down the mobile layout today', () => {
      const { rail } = renderRail({ width: 375 })

      expect(
        tokensOf(rail),
        'the left rule must be lg-only, or it dangles beside the stacked mobile rail'
      ).not.toContain('border-l')
    })

    it('restores the left rule at lg, so the desktop rail is unchanged', () => {
      const { rail } = renderRail({ width: 1280 })

      const tokens = tokensOf(rail)
      expect(tokens).toContain('lg:border-l')
      expect(tokens, 'the mobile bottom rule must be switched off at lg').toContain('lg:border-b-0')
    })

    it('renders no disclosure toggle at 1280px, so the desktop rail gains no affordance', () => {
      const { rail } = renderRail({ width: 1280 })

      expect(togglesIn(rail)).toEqual([])
    })
  })

  describe('stacking above the main content on a phone (AC2)', () => {
    it('draws its rule along the bottom below lg', () => {
      const { rail } = renderRail({ width: 375 })

      expect(tokensOf(rail)).toContain('border-b')
    })

    // The rail is FIRST IN THE DOM (see StoryDetailPage.detailRail.test.tsx), so
    // below lg it needs no `order` at all: DOM order is visual order, and that is
    // also the order a screen reader traverses. At lg it flips to the right-hand
    // track with `lg:order-last`, which beats the main column's default `order: 0`
    // on its own — an adopter never has to put a matching class on its own column.
    it('sets no order below lg, so DOM order is what the reader gets', () => {
      const { rail } = renderRail({ width: 375 })

      expect(
        tokensOf(rail).filter((token) => token.startsWith('order-')),
        'an unprefixed order class would divorce the visual order from the DOM order'
      ).toEqual([])
    })

    it('flips to the right-hand track at lg without any help from the adopter', () => {
      const { rail } = renderRail({ width: 1280 })

      const tokens = tokensOf(rail)
      expect(tokens, 'the rail must return to the right-hand track at lg').toContain(
        'lg:order-last'
      )
      expect(
        tokens,
        'lg:order-2 only works if the adopter also orders its main column'
      ).not.toContain('lg:order-2')
    })

    it('lays the fields two across below lg and one per line at lg', () => {
      const { rail } = renderRail({ width: 375 })

      const tokens = tokensOf(fieldsContainer(rail))
      expect(tokens).toContain('grid')
      expect(tokens, 'four one-per-line fields waste half a phone screen').toContain('grid-cols-2')
      expect(tokens, 'the desktop rail stacks its fields one per line').toContain('lg:grid-cols-1')
    })

    // Two across on a phone leaves each cell ~160px wide, and DetailField's fixed
    // 80px label track then squeezes the control to 68px — at the 16px font size
    // T02 forces on every <select> below md, that is about four characters, so
    // "In Progress" reads "In P…". Stacking the label above the control below lg
    // gives the control the whole cell back.
    it('stacks each field label above its control below lg', () => {
      const { rail } = renderRail({ width: 375 })

      const tokens = tokensOf(fieldRow(rail, 'Status'))
      expect(tokens, 'the label must sit on its own line below lg').toContain('grid-cols-1')
      expect(
        tokens,
        'a fixed 80px label track leaves the control 68px on a phone'
      ).not.toContain('grid-cols-[80px_1fr]')
    })

    it('restores the fixed label track at lg, leaving the desktop field unchanged', () => {
      const { rail } = renderRail({ width: 1280 })

      expect(tokensOf(fieldRow(rail, 'Status'))).toContain('lg:grid-cols-[80px_1fr]')
    })

    it('applies the same aside classes at 375px and 1280px, proving the switch is CSS-only', () => {
      const mobile = renderRail({ width: 375 })
      const mobileClassName = mobile.rail.className
      mobile.unmount()

      const desktop = renderRail({ width: 1280 })

      expect(desktop.rail.className).toBe(mobileClassName)
    })

    it('renders identical field markup at 375px and 1280px', () => {
      const mobile = renderRail({ width: 375 })
      const mobileFields = normalise(fieldsContainer(mobile.rail).outerHTML)
      mobile.unmount()

      const desktop = renderRail({ width: 1280 })

      expect(normalise(fieldsContainer(desktop.rail).outerHTML)).toBe(mobileFields)
    })
  })

  describe('the fields it is given', () => {
    it('renders every field row it was handed', () => {
      const { rail } = renderRail()

      for (const label of ['Status', 'Priority', 'Project', 'Created']) {
        expect(within(rail).getByText(label)).toBeInTheDocument()
      }
    })

    it('shows the field values without any interaction at 375px', () => {
      renderRail({ width: 375 })

      expect(screen.getByRole('combobox', { name: 'Status' })).toBeVisible()
      expect(screen.getByRole('combobox', { name: 'Priority' })).toBeVisible()
    })
  })

  describe('the primary disclosure is open by default on a phone (AC3)', () => {
    it('exposes a toggle named by its label at 375px', () => {
      renderRail({ width: 375 })

      expect(toggle('Details')).toBeInTheDocument()
    })

    it('starts expanded, so status and priority need no tap to reach', () => {
      renderRail({ width: 375 })

      expect(toggle('Details')).toHaveAttribute('aria-expanded', 'true')
    })

    it('hides the fields when the reader collapses it', async () => {
      const user = userEvent.setup()
      renderRail({ width: 375 })

      await user.click(toggle('Details'))

      expect(toggle('Details')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    })
  })

  describe('the status-history disclosure starts collapsed on a phone (AC3)', () => {
    it('exposes a toggle named by the secondary label at 375px', () => {
      renderRail({ width: 375 })

      expect(toggle('Status History')).toBeInTheDocument()
    })

    it('starts collapsed', () => {
      renderRail({ width: 375 })

      expect(toggle('Status History')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Moved to Done')).not.toBeInTheDocument()
    })

    it('reveals the history when the reader expands it', async () => {
      const user = userEvent.setup()
      renderRail({ width: 375 })

      await user.click(toggle('Status History'))

      expect(toggle('Status History')).toHaveAttribute('aria-expanded', 'true')
      expect(await screen.findByText('Moved to Done')).toBeVisible()
    })

    it('shows the history at 1280px with no interaction at all', () => {
      renderRail({ width: 1280 })

      expect(screen.getByText('Moved to Done')).toBeVisible()
    })

    it('still labels the history section at 1280px, as the rail does today', () => {
      const { rail } = renderRail({ width: 1280 })

      expect(within(rail).getByText('Status History')).toBeInTheDocument()
    })

    it('renders no second section when none is given', () => {
      const { rail } = renderRail({ width: 375, secondary: null })

      expect(within(rail).queryByText('Status History')).not.toBeInTheDocument()
      expect(togglesIn(rail).map((el) => el.textContent)).toEqual(['Details'])
    })
  })

  describe('accessibility', () => {
    it('exposes the rail as a landmark carrying the name it was given', () => {
      renderRail({ width: 1280 })

      expect(screen.getByRole('complementary', { name: 'Details' })).toBeInTheDocument()
    })

    it('points each toggle at the panel it controls', () => {
      renderRail({ width: 375 })

      const controls = toggle('Status History').getAttribute('aria-controls')
      expect(controls, 'the toggle must name the panel it owns').toBeTruthy()
      expect(document.getElementById(controls as string)).not.toBeNull()
    })

    it('lets a keyboard user expand the history without a pointer', async () => {
      const user = userEvent.setup()
      renderRail({ width: 375 })

      toggle('Status History').focus()
      await user.keyboard('{Enter}')

      expect(toggle('Status History')).toHaveAttribute('aria-expanded', 'true')
      expect(await screen.findByText('Moved to Done')).toBeVisible()
    })

    it('reaches the status control by Tab at 375px without expanding anything first', async () => {
      const user = userEvent.setup()
      renderRail({ width: 375 })

      toggle('Details').focus()
      await user.tab()

      expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Status' }))
    })

    it('renders its toggles as buttons that never submit a surrounding form', () => {
      const { rail } = renderRail({ width: 375 })

      for (const el of togglesIn(rail)) {
        expect(el.tagName).toBe('BUTTON')
        expect(el).toHaveAttribute('type', 'button')
      }
    })
  })

  // Defect I6 (final whole-branch review) — the DisclosureToggle button is
  // `py-1` at `text-ui-md`, ~28px tall, with no `tap-safe`. It is mobile-only
  // (it does not render at lg) and it is the control a phone user must press
  // to reach a story's or task's status and priority at all. T11's ledger
  // note assigned it to T21 by name, but T21's four AC categories missed it.
  describe('mobile tap target (defect I6)', () => {
    it('makes the primary "Details" disclosure toggle tap-safe', () => {
      renderRail({ width: 375 })

      expectTapSafeControl(toggle('Details'), 'the DetailRail primary disclosure toggle')
    })

    it('makes the secondary "Status History" disclosure toggle tap-safe', () => {
      renderRail({ width: 375 })

      expectTapSafeControl(toggle('Status History'), 'the DetailRail secondary disclosure toggle')
    })
  })
})
