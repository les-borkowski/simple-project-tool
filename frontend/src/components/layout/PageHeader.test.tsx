import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test/render'
import { setViewportWidth } from '../../test/setup'
import { PageHeader } from './PageHeader'

// ---------------------------------------------------------------------------
// Public API under test (T09):
//
//   <PageHeader
//     title={ReactNode}          // rendered as the page's <h1>
//     subtitle?={ReactNode}      // the small stone-500 line under the title
//     breadcrumbs?={ReactNode}   // a <Breadcrumbs/> element, rendered ABOVE the title
//     actions?={ReactNode}       // toolbar / primary action cluster
//     loading?={boolean}         // skeleton state, same container box as loaded
//   />
//
// jsdom computes no layout: `getBoundingClientRect()` returns zeros and Tailwind
// classes are never resolved to styles. So every "it wraps / it sticks / it is
// padded" claim below is asserted as *class token presence on the rendered
// element*, never as measured geometry. Class tokens are read off `classList`
// (exact, whitespace-split tokens) so `px-7` cannot accidentally match inside
// `md:px-7`.
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  breadcrumbs?: ReactNode
  actions?: ReactNode
  loading?: boolean
}

// AC1: one canonical padding recipe replacing the four drifted combos.
const CANONICAL_PADDING = ['px-4', 'pt-4', 'pb-3', 'md:px-7', 'md:pt-5', 'md:pb-3']

// The four combos being retired, as unprefixed tokens:
//   px-7 pt-6 pb-4  (ProjectsPage, InvitationsPage)
//   px-7 pt-5 pb-4  (SearchResultsPage, StoryDetailPage)
const DRIFTED_PADDING = ['px-7', 'pt-6', 'pb-4', 'pt-5', 'pb-5', 'pt-3', 'px-6']

function renderPageHeader(props: PageHeaderProps) {
  const view = renderWithProviders(<PageHeader {...props} />)
  return { ...view, root: view.container.firstElementChild as HTMLElement }
}

/**
 * Which structural slots the header reserved, read off the DOM shape alone so
 * the loading and loaded renders of the same props can be compared. The class
 * tokens are the ones the loaded header is already asserted to carry above.
 */
function slotsOf(root: HTMLElement) {
  return {
    heading: root.querySelectorAll('h1').length,
    breadcrumbs: root.querySelectorAll(':scope > .mb-2').length,
    subtitle: root.querySelectorAll('p').length,
    actions: root.querySelectorAll('.w-full.md\\:w-auto').length,
  }
}

/** The ancestor of `descendant` that is a direct child of `parent`. */
function directChildOf(parent: HTMLElement, descendant: HTMLElement): HTMLElement {
  let node: HTMLElement = descendant
  while (node.parentElement && node.parentElement !== parent) {
    node = node.parentElement
  }
  expect(node.parentElement, 'expected the element to be nested inside the given parent').toBe(
    parent
  )
  return node
}

describe('PageHeader', () => {
  describe('content', () => {
    it('renders the title as the page level-1 heading', () => {
      renderPageHeader({ title: 'Projects' })

      expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    })

    it('renders the subtitle underneath the title', () => {
      const { root } = renderPageHeader({ title: 'Projects', subtitle: '3 active' })

      const heading = screen.getByRole('heading', { level: 1, name: 'Projects' })
      const subtitle = screen.getByText('3 active')

      expect(root).toContainElement(subtitle)
      expect(
        heading.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('renders no subtitle text at all when none is given', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      expect(root).toHaveTextContent('Projects')
      expect(root.textContent?.replace('Projects', '').trim()).toBe('')
    })

    it('renders the breadcrumbs above the title', () => {
      const { root } = renderPageHeader({
        title: 'Deep story',
        breadcrumbs: <span>crumb trail</span>,
      })

      const crumbs = screen.getByText('crumb trail')
      const heading = screen.getByRole('heading', { level: 1, name: 'Deep story' })

      expect(root).toContainElement(crumbs)
      expect(
        crumbs.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('renders the actions cluster', () => {
      renderPageHeader({
        title: 'Projects',
        actions: (
          <button type="button">New project</button>
        ),
      })

      expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
    })
  })

  describe('canonical padding recipe (AC1)', () => {
    it('applies px-4 pt-4 pb-3 md:px-7 md:pt-5 md:pb-3 to its container', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      expect(Array.from(root.classList)).toEqual(expect.arrayContaining(CANONICAL_PADDING))
    })

    it('carries none of the four drifted padding combos it replaces', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      const tokens = Array.from(root.classList)
      for (const drifted of DRIFTED_PADDING) {
        expect(tokens, `page header still carries the retired "${drifted}" padding`).not.toContain(
          drifted
        )
      }
    })

    it('keeps the bottom rule and page background the four old headers shared', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      const tokens = Array.from(root.classList)
      expect(tokens).toEqual(
        expect.arrayContaining([
          'border-b',
          'border-stone-200',
          'dark:border-stone-800',
          'bg-white',
          'dark:bg-stone-950',
        ])
      )
    })
  })

  describe('sticky offset uses the --spacing-topbar token', () => {
    it('sticks below the mobile top bar and sits flush from lg up', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      const tokens = Array.from(root.classList)
      expect(tokens).toContain('sticky')
      expect(tokens).toContain('top-topbar')
      expect(tokens).toContain('lg:top-0')
    })

    it('never hardcodes the 3rem top bar height instead of the token', () => {
      const { root } = renderPageHeader({ title: 'Projects' })

      for (const hardcoded of ['top-12', 'top-[3rem]', 'top-[48px]']) {
        expect(
          Array.from(root.classList),
          `use the --spacing-topbar token (top-topbar), not "${hardcoded}"`
        ).not.toContain(hardcoded)
      }
    })
  })

  describe('loading state (AC2)', () => {
    it('renders a container className byte-identical to the loaded state, so there is no layout jump', () => {
      const loadingView = renderPageHeader({ title: 'Projects', loading: true })
      const loadingClassName = loadingView.root.className
      loadingView.unmount()

      const loadedView = renderPageHeader({ title: 'Projects' })

      expect(loadedView.root.className).toBe(loadingClassName)
    })

    it('keeps the container className identical even when the loaded header has a subtitle and actions', () => {
      const loadingView = renderPageHeader({
        title: 'Projects',
        subtitle: '3 active',
        actions: <button type="button">New project</button>,
        loading: true,
      })
      const loadingClassName = loadingView.root.className
      loadingView.unmount()

      const loadedView = renderPageHeader({
        title: 'Projects',
        subtitle: '3 active',
        actions: <button type="button">New project</button>,
      })

      expect(loadedView.root.className).toBe(loadingClassName)
    })

    it('shows a pulsing skeleton placeholder while loading', () => {
      const { root } = renderPageHeader({ title: 'Projects', loading: true })

      expect(root.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('shows no skeleton placeholder once loaded', () => {
      const { root } = renderPageHeader({ title: 'Projects', subtitle: '3 active' })

      expect(root.querySelectorAll('.animate-pulse').length).toBe(0)
    })

    // A skeleton that always draws two lines makes the header jump the moment
    // the data lands — down for a bare title, up for a header with breadcrumbs
    // and an actions row. The placeholder has to reserve the slots the loaded
    // header will actually fill, no more and no fewer.
    describe('reserves the same slots as the loaded header', () => {
      const SHAPES: { name: string; props: PageHeaderProps }[] = [
        { name: 'a title on its own', props: { title: 'Projects' } },
        {
          name: 'a title and a subtitle',
          props: { title: 'Projects', subtitle: '3 active' },
        },
        {
          name: 'breadcrumbs, a title, a subtitle and actions',
          props: {
            title: 'Login flow',
            subtitle: '4 tasks',
            breadcrumbs: <span>crumb trail</span>,
            actions: <button type="button">New task</button>,
          },
        },
      ]

      for (const shape of SHAPES) {
        it(`given ${shape.name}`, () => {
          const loadingView = renderPageHeader({ ...shape.props, loading: true })
          const loadingSlots = slotsOf(loadingView.root)
          loadingView.unmount()

          const loadedView = renderPageHeader(shape.props)

          expect(loadingSlots).toEqual(slotsOf(loadedView.root))
        })
      }
    })

    it('still exposes a level-1 heading while loading, so the page is never without one', () => {
      renderPageHeader({ title: 'Projects', loading: true })

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
  })

  describe('at 375px the actions cluster wraps instead of squashing the title (AC3)', () => {
    function renderNarrowHeader() {
      setViewportWidth(375)
      const view = renderPageHeader({
        title: 'A rather long project page title',
        subtitle: '12 active',
        actions: <button type="button">New project</button>,
      })
      const action = screen.getByRole('button', { name: 'New project' })
      const actionsSlot = action.parentElement as HTMLElement
      const row = actionsSlot.parentElement as HTMLElement
      return { ...view, action, actionsSlot, row }
    }

    it('puts the title and the actions in one wrapping flex row', () => {
      const { row } = renderNarrowHeader()

      const heading = screen.getByRole('heading', { level: 1 })
      expect(row, 'title and actions should share one flex row').toContainElement(heading)

      const tokens = Array.from(row.classList)
      expect(tokens).toContain('flex')
      expect(tokens, 'the row must be allowed to wrap at 375px').toContain('flex-wrap')
      expect(tokens).not.toContain('flex-nowrap')
    })

    it('gives the actions cluster the full line below md and its natural width from md up', () => {
      const { actionsSlot } = renderNarrowHeader()

      const tokens = Array.from(actionsSlot.classList)
      expect(tokens, 'actions should take their own line on a phone').toContain('w-full')
      expect(tokens, 'actions should sit inline again from md up').toContain('md:w-auto')
    })

    it('lets the title block shrink (min-w-0) rather than being crushed by the actions', () => {
      const { row } = renderNarrowHeader()

      const heading = screen.getByRole('heading', { level: 1 })
      const titleSlot = directChildOf(row, heading)

      expect(Array.from(titleSlot.classList)).toContain('min-w-0')
    })
  })

  describe('responsiveness is CSS-only', () => {
    it('renders identical markup at 375px and 1280px', () => {
      // useId counters are global and never reset between mounts, so normalise
      // any generated ids before comparing; they say nothing about layout.
      const normalise = (html: string) =>
        html.replace(/(id|aria-labelledby|aria-describedby)="[^"]*"/g, '$1="stable"')

      setViewportWidth(375)
      const mobile = renderPageHeader({
        title: 'Projects',
        subtitle: '3 active',
        actions: <button type="button">New project</button>,
      })
      const mobileHtml = normalise(mobile.root.outerHTML)
      mobile.unmount()

      setViewportWidth(1280)
      const desktop = renderPageHeader({
        title: 'Projects',
        subtitle: '3 active',
        actions: <button type="button">New project</button>,
      })

      expect(normalise(desktop.root.outerHTML)).toBe(mobileHtml)
    })
  })

  describe('accessibility', () => {
    it('exposes exactly one level-1 heading carrying the page name', () => {
      renderPageHeader({ title: 'Invitations', subtitle: 'Waiting for you' })

      const headings = screen.getAllByRole('heading', { level: 1 })
      expect(headings).toHaveLength(1)
      expect(headings[0]).toHaveAccessibleName('Invitations')
    })

    it('keeps the primary action reachable and operable by keyboard', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()
      renderPageHeader({
        title: 'Projects',
        actions: (
          <button type="button" onClick={onClick}>
            New project
          </button>
        ),
      })

      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New project' }))

      await user.keyboard('{Enter}')
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not announce a skeleton as if it were the real title', () => {
      const { root } = renderPageHeader({ title: 'Projects', loading: true })

      const skeletons = root.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
      for (const skeleton of skeletons) {
        expect(skeleton.textContent, 'a skeleton block must not carry readable text').toBe('')
      }
    })
  })
})
