import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { act, renderWithProviders, screen, within } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { Breadcrumbs } from './Breadcrumbs'
import enGB from '../../locales/en-GB.json'
import pl from '../../locales/pl.json'

// ---------------------------------------------------------------------------
// Public API under test (T09):
//
//   interface Crumb { label: string; to?: string }
//   <Breadcrumbs items={Crumb[]} />
//
// House convention, lifted verbatim from StoryDetailPage.tsx:170-176 — every
// crumb but the last is a <Link>, the last is a plain <span>, separated by "/".
//
// Collapse behaviour (AC4): below md, with more than three crumbs the trail
// renders as
//   first / … / parent / current
// and the "…" control expands the hidden crumbs in place. From md up the full
// trail is always rendered — a wide screen must not lose a crumb. The tests
// below exercise the *behaviour* (which crumbs are in the DOM, what clicking
// does), never a measured width — jsdom computes no layout.
// ---------------------------------------------------------------------------

const EXPANDER_KEY = 'nav.show_all_crumbs'

interface Crumb {
  label: string
  to?: string
}

function renderBreadcrumbs(items: Crumb[]) {
  const view = renderWithProviders(<Breadcrumbs items={items} />)
  const nav = screen.getByRole('navigation')
  return { ...view, nav }
}

const THREE: Crumb[] = [
  { label: 'Projects', to: '/projects' },
  { label: 'Apollo', to: '/projects/p1' },
  { label: 'Login flow' },
]

const FOUR: Crumb[] = [
  { label: 'Projects', to: '/projects' },
  { label: 'Apollo', to: '/projects/p1' },
  { label: 'Login flow', to: '/projects/p1/stories/s1' },
  { label: 'Wire up the reset link' },
]

const FIVE: Crumb[] = [
  { label: 'Projects', to: '/projects' },
  { label: 'Apollo', to: '/projects/p1' },
  { label: 'Sprint 4', to: '/projects/p1/sprints/sp4' },
  { label: 'Login flow', to: '/projects/p1/stories/s1' },
  { label: 'Wire up the reset link' },
]

function linkNames(nav: HTMLElement): string[] {
  return within(nav)
    .queryAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
}

describe('Breadcrumbs', () => {
  describe('with a short trail', () => {
    it('renders every crumb in order', () => {
      const { nav } = renderBreadcrumbs(THREE)

      expect(nav.textContent).toMatch(/Projects.*Apollo.*Login flow/s)
    })

    it('links every crumb except the current one, which stays plain text', () => {
      const { nav } = renderBreadcrumbs(THREE)

      expect(linkNames(nav)).toEqual(['Projects', 'Apollo'])
      expect(within(nav).getByText('Login flow')).toBeInTheDocument()
      expect(within(nav).queryByRole('link', { name: 'Login flow' })).not.toBeInTheDocument()
    })

    it('never links the last crumb even when it was given a target', () => {
      const { nav } = renderBreadcrumbs([
        { label: 'Projects', to: '/projects' },
        { label: 'Apollo', to: '/projects/p1' },
      ])

      expect(within(nav).queryByRole('link', { name: 'Apollo' })).not.toBeInTheDocument()
      expect(within(nav).getByText('Apollo')).toBeInTheDocument()
    })

    it('offers no collapse control with three crumbs at 375px', () => {
      setViewportWidth(375)
      const { nav } = renderBreadcrumbs(THREE)

      expect(within(nav).queryAllByRole('button')).toHaveLength(0)
    })

    it('offers no collapse control with a single crumb', () => {
      const { nav } = renderBreadcrumbs([{ label: 'Projects' }])

      expect(within(nav).queryAllByRole('button')).toHaveLength(0)
      expect(within(nav).getByText('Projects')).toBeInTheDocument()
    })

    it('exposes the trail as a navigation landmark', () => {
      const { nav } = renderBreadcrumbs(THREE)

      expect(nav.tagName).toBe('NAV')
    })

    it('separates crumbs with a slash, as the existing trails do', () => {
      const { nav } = renderBreadcrumbs(THREE)

      expect(nav.textContent).toContain('/')
    })
  })

  describe('collapsing a four-crumb trail at 375px (AC4)', () => {
    function renderCollapsed(items: Crumb[] = FOUR) {
      setViewportWidth(375)
      return renderBreadcrumbs(items)
    }

    it('shows first / … / parent / current and hides the crumbs in between', () => {
      const { nav } = renderCollapsed()

      expect(linkNames(nav)).toEqual(['Projects', 'Login flow'])
      expect(within(nav).queryByText('Apollo')).not.toBeInTheDocument()
      expect(within(nav).getByText('Wire up the reset link')).toBeInTheDocument()
    })

    it('collapses everything between the first and the parent when there are five crumbs', () => {
      const { nav } = renderCollapsed(FIVE)

      expect(linkNames(nav)).toEqual(['Projects', 'Login flow'])
      expect(within(nav).queryByText('Apollo')).not.toBeInTheDocument()
      expect(within(nav).queryByText('Sprint 4')).not.toBeInTheDocument()
    })

    it('offers an ellipsis control in place of the hidden crumbs', () => {
      const { nav } = renderCollapsed()

      const expander = within(nav).getByRole('button')
      expect(expander).toHaveTextContent('…')
    })

    it('gives the ellipsis control a translated accessible name', () => {
      const { nav } = renderCollapsed()

      const expander = within(nav).getByRole('button')
      expect(expander).toHaveAccessibleName()
      expect(
        expander,
        `the control must be labelled from the ${EXPANDER_KEY} locale key, not the raw key`
      ).not.toHaveAccessibleName(EXPANDER_KEY)
    })

    it('expands the hidden crumbs in place when the ellipsis is clicked', async () => {
      const user = userEvent.setup()
      const { nav } = renderCollapsed()

      await user.click(within(nav).getByRole('button'))

      expect(await within(nav).findByRole('link', { name: 'Apollo' })).toBeInTheDocument()
      expect(linkNames(nav)).toEqual(['Projects', 'Apollo', 'Login flow'])
      expect(within(nav).getByText('Wire up the reset link')).toBeInTheDocument()
    })

    it('drops the ellipsis control once the trail is expanded', async () => {
      const user = userEvent.setup()
      const { nav } = renderCollapsed()

      await user.click(within(nav).getByRole('button'))
      await within(nav).findByRole('link', { name: 'Apollo' })

      expect(within(nav).queryAllByRole('button')).toHaveLength(0)
    })

    it('expands in place rather than navigating away', async () => {
      const user = userEvent.setup()
      const { nav } = renderCollapsed()

      const expander = within(nav).getByRole('button')
      expect(expander.tagName, 'the ellipsis must be a button, not a link').toBe('BUTTON')

      await user.click(expander)

      expect(await within(nav).findByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    })

    it('is reachable and operable by keyboard', async () => {
      const user = userEvent.setup()
      const { nav } = renderCollapsed()

      await user.tab()
      await user.tab()
      expect(document.activeElement).toBe(within(nav).getByRole('button'))

      await user.keyboard('{Enter}')

      expect(await within(nav).findByRole('link', { name: 'Apollo' })).toBeInTheDocument()
    })
  })

  // The collapse hides crumbs from the DOM and from the accessibility tree, so
  // it is gated on the md breakpoint: a desktop reader of a four-crumb trail
  // (TaskDetailPage's Projects / project / story / task) must still see the
  // project link without clicking anything.
  describe('from md up the trail is never collapsed', () => {
    it('renders all four crumbs at 1280px', () => {
      setViewportWidth(1280)
      const { nav } = renderBreadcrumbs(FOUR)

      expect(linkNames(nav)).toEqual(['Projects', 'Apollo', 'Login flow'])
      expect(within(nav).getByText('Wire up the reset link')).toBeInTheDocument()
    })

    it('offers no ellipsis control at 1280px', () => {
      setViewportWidth(1280)
      const { nav } = renderBreadcrumbs(FOUR)

      expect(within(nav).queryAllByRole('button')).toHaveLength(0)
      expect(nav.textContent).not.toContain('…')
    })

    it('renders every crumb of a five-crumb trail at 768px, the md boundary', () => {
      setViewportWidth(768)
      const { nav } = renderBreadcrumbs(FIVE)

      expect(linkNames(nav)).toEqual(['Projects', 'Apollo', 'Sprint 4', 'Login flow'])
      expect(within(nav).queryAllByRole('button')).toHaveLength(0)
    })

    it('collapses again when the viewport narrows below md', () => {
      setViewportWidth(1280)
      const { nav } = renderBreadcrumbs(FOUR)
      expect(within(nav).getByText('Apollo')).toBeInTheDocument()

      act(() => {
        setViewportWidth(375)
      })

      expect(within(nav).queryByText('Apollo')).not.toBeInTheDocument()
      expect(within(nav).getByRole('button')).toHaveTextContent('…')
    })
  })

  describe('locale coverage', () => {
    it('defines the ellipsis control label in both en-GB and pl', () => {
      const en = (enGB as Record<string, string>)[EXPANDER_KEY]
      const polish = (pl as Record<string, string>)[EXPANDER_KEY]

      expect(en, `${EXPANDER_KEY} is missing from src/locales/en-GB.json`).toBeTypeOf('string')
      expect(polish, `${EXPANDER_KEY} is missing from src/locales/pl.json`).toBeTypeOf('string')
      expect(en?.trim()).not.toBe('')
      expect(polish?.trim()).not.toBe('')
    })
  })
})
