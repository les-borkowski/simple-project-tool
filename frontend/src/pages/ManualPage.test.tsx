import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, within } from '../test/render'
import { ManualPage } from './ManualPage'

const SECTIONS = [
  'Getting started',
  'Getting around',
  'Projects',
  'The board',
  'Stories',
  'Tasks',
  'Comments',
  'Status history & time',
  'Sprints',
  'Timeline',
  'Quick capture',
  'Members & roles',
  'Settings',
  'For power users',
]

describe('ManualPage', () => {
  it('renders every section', () => {
    renderWithProviders(<ManualPage />, { route: '/manual' })

    for (const heading of SECTIONS) {
      expect(screen.getByRole('heading', { name: heading, level: 2 })).toBeInTheDocument()
    }
  })

  it('lists every section in the contents', () => {
    renderWithProviders(<ManualPage />, { route: '/manual' })
    const toc = screen.getByRole('navigation', { name: /contents/i })

    for (const heading of SECTIONS) {
      expect(within(toc).getByRole('link', { name: heading })).toBeInTheDocument()
    }
  })

  // The manual is one long page held together entirely by in-page anchors —
  // the contents rail and a dozen cross-references between sections. A renamed
  // or dropped section id breaks them silently, with no build or type error to
  // catch it, so every anchor is resolved against the document here.
  it('has no dangling in-page anchors', () => {
    const { container } = renderWithProviders(<ManualPage />, { route: '/manual' })

    const anchors = Array.from(container.querySelectorAll('a[href^="#"]'))
    expect(anchors.length).toBeGreaterThan(SECTIONS.length)

    const dangling = anchors
      .map((a) => a.getAttribute('href')!.slice(1))
      .filter((id) => container.querySelector(`#${id}`) === null)

    expect(dangling).toEqual([])
  })

  it('describes the forgot-password flow that the app actually has', () => {
    renderWithProviders(<ManualPage />, { route: '/manual' })

    expect(screen.getByText(/Forgot password\?/)).toBeInTheDocument()
  })

  // Arriving on a deep link, the browser jumps straight to the anchor. The
  // scroll-spy cannot see that jump — its observer reports the positions from
  // before it and then goes quiet until something crosses the band again — so
  // the rail would mark the wrong entry until the reader happened to scroll.
  // The hash therefore seeds the highlight rather than waiting for the
  // observer.
  it('marks the linked section when arriving on a deep link', () => {
    renderWithProviders(<ManualPage />, { route: '/manual#timeline' })
    const toc = screen.getByRole('navigation', { name: /contents/i })

    expect(within(toc).getByRole('link', { name: 'Timeline' })).toHaveAttribute(
      'aria-current',
      'location'
    )
    expect(within(toc).getByRole('link', { name: 'Getting started' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('marks the first section when arriving with no hash', () => {
    renderWithProviders(<ManualPage />, { route: '/manual' })
    const toc = screen.getByRole('navigation', { name: /contents/i })

    expect(within(toc).getByRole('link', { name: 'Getting started' })).toHaveAttribute(
      'aria-current',
      'location'
    )
  })
})
