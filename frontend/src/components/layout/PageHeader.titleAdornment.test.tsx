import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, screen } from '../../test/render'
import { PageHeader } from './PageHeader'

// ---------------------------------------------------------------------------
// T13a / ruling R1: PageHeader gains one new optional slot.
//
//   titleAdornment?: ReactNode   // rendered BESIDE the <h1>, in the same row
//
// ProjectDetailPage's status pill and priority control have always sat inline
// with the project name. Neither of the existing slots can carry them:
//   - through `title` they land INSIDE the <h1>, so heading navigation
//     announces "Apollo To Do Medium" and interactive controls end up nested in
//     a heading;
//   - through `subtitle` they drop onto the line below, which changes desktop
//     appearance (global constraint 4).
//
// So the contract is: the <h1> stays text-only, and the adornment renders as a
// sibling in the same flex row. jsdom computes no layout, so "same row" is
// asserted as DOM containment plus the row's flex class tokens, never geometry.
// ---------------------------------------------------------------------------

/** The element that holds both the heading and anything rendered beside it. */
function titleRowOf(heading: HTMLElement): HTMLElement {
  const row = heading.parentElement
  expect(row, 'the heading must have a parent element to share with the adornment').not.toBeNull()
  return row as HTMLElement
}

describe('PageHeader titleAdornment', () => {
  it('renders the adornment beside the heading rather than inside it', () => {
    renderWithProviders(
      <PageHeader
        title="Apollo"
        titleAdornment={
          <button type="button" onClick={() => {}}>
            To Do
          </button>
        }
      />
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Apollo' })
    const adornment = screen.getByRole('button', { name: 'To Do' })

    const row = titleRowOf(heading)

    expect(row, 'the adornment must sit in the same row as the heading').toContainElement(adornment)
    // Containment alone would also be satisfied by a block element stacked
    // below the <h1>, which is exactly what the slot exists to avoid, so the
    // row's own layout is pinned too.
    expect(Array.from(row.classList), 'the shared row must lay its children out inline').toEqual(
      expect.arrayContaining(['flex', 'items-center'])
    )
    expect(
      heading.querySelector('button, select'),
      'no interactive control may be nested inside the <h1>'
    ).toBeNull()
  })

  it('keeps the heading announcing the page name alone', () => {
    renderWithProviders(
      <PageHeader
        title="Apollo"
        titleAdornment={
          <>
            <button type="button">To Do</button>
            <button type="button">Medium</button>
          </>
        }
      />
    )

    // Both adornment controls are on screen…
    expect(screen.getByRole('button', { name: 'To Do' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument()
    // …and none of them is part of what a screen reader reads for the heading.
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Apollo')
  })

  it('keeps the adornment reachable and operable by keyboard', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    renderWithProviders(
      <PageHeader
        title="Apollo"
        titleAdornment={
          <button type="button" onClick={onClick}>
            To Do
          </button>
        }
      />
    )

    await user.tab()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'To Do' }))

    await user.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reserves the adornment’s place in the title row while loading', () => {
    // A caller that knows it will draw an adornment gets the space held for it,
    // so the title row is the same height before and after the fetch. The real
    // control cannot render yet — its value is what is being fetched.
    renderWithProviders(
      <PageHeader loading title="Apollo" titleAdornment={<button type="button">To Do</button>} />
    )

    const row = titleRowOf(screen.getByRole('heading', { level: 1 }))

    expect(screen.queryByRole('button', { name: 'To Do' })).not.toBeInTheDocument()
    expect(
      row.querySelector(':scope > .animate-pulse'),
      'the loading row must hold the adornment’s place beside the title'
    ).not.toBeNull()
    expect(Array.from(row.classList)).toEqual(expect.arrayContaining(['flex', 'items-center']))
  })

  it('adds nothing to the header for the callers that omit it', () => {
    // ProjectsPage, InvitationsPage, SearchResultsPage and StoryDetailPage all
    // pass no adornment; the slot must not leak so much as a stray character
    // into their headers.
    const { container } = renderWithProviders(<PageHeader title="Projects" subtitle="3 active" />)
    const root = container.firstElementChild as HTMLElement

    expect(root).toHaveTextContent('Projects')
    expect(root).toHaveTextContent('3 active')
    expect(root.textContent?.replace('Projects', '').replace('3 active', '').trim()).toBe('')
  })
})
