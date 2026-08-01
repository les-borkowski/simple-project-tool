import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { PageHeader } from './PageHeader'

// ---------------------------------------------------------------------------
// T15a / ruling from the human partner: PageHeader gains a second additive
// slot.
//
//   meta?: ReactNode   // rendered BELOW the title (and below `subtitle` when
//                       // both are present), in a `flex items-center gap-2
//                       // mt-2 flex-wrap` row.
//
// TaskDetailPage's status/priority/assignee cluster sits below the title and
// holds interactive controls (a <button>, two <select>s). Neither existing
// slot can carry it:
//   - `title` would put the controls INSIDE the <h1>, so heading navigation
//     announces "Apollo To Do Medium … " and buries interactive controls in a
//     heading;
//   - `subtitle` renders a <p className="text-[13px] text-stone-500 mt-0.5">,
//     which announces a control cluster as a paragraph of text and restyles
//     the controls to the subtitle's grey, small type;
//   - `titleAdornment` renders BESIDE the <h1>, which at 1280px would move the
//     cluster up a line, changing desktop appearance (global constraint 4).
//
// So `meta` is new: a third slot, below the title row, additive so headers
// that omit it render byte-identical markup to today (same guarantee
// PageHeader.titleAdornment.test.tsx already established for that slot).
// ---------------------------------------------------------------------------

describe('PageHeader meta slot', () => {
  it('renders meta below the heading rather than inside it', () => {
    renderWithProviders(
      <PageHeader
        title="Fix login bug"
        meta={
          <button type="button" onClick={() => {}}>
            To Do
          </button>
        }
      />
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Fix login bug' })
    const control = screen.getByRole('button', { name: 'To Do' })

    expect(heading.querySelector('button, select'), 'no control may nest inside the <h1>').toBeNull()
    expect(
      heading.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING,
      'meta must come after the heading in the DOM'
    ).toBeTruthy()
  })

  it('does not render meta inside the subtitle paragraph', () => {
    renderWithProviders(
      <PageHeader
        title="Fix login bug"
        subtitle="3 comments"
        meta={<button type="button">To Do</button>}
      />
    )

    const subtitle = screen.getByText('3 comments')
    expect(subtitle.tagName).toBe('P')
    expect(
      subtitle.querySelector('button'),
      'meta must not be nested inside the subtitle <p>'
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'To Do' })).toBeInTheDocument()
  })

  it('reproduces the flex-wrap cluster row TaskDetailPage draws today', () => {
    renderWithProviders(
      <PageHeader
        title="Fix login bug"
        meta={
          <>
            <button type="button">To Do</button>
            <button type="button">Medium</button>
          </>
        }
      />
    )

    const control = screen.getByRole('button', { name: 'To Do' })
    const row = control.parentElement as HTMLElement

    expect(Array.from(row.classList)).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'gap-2', 'mt-2', 'flex-wrap'])
    )
  })

  it('keeps the heading announcing the title alone when meta is present', () => {
    renderWithProviders(
      <PageHeader
        title="Fix login bug"
        meta={
          <>
            <button type="button">To Do</button>
            <button type="button">Medium</button>
          </>
        }
      />
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Fix login bug')
  })

  it('adds nothing to the header for callers that omit meta', () => {
    const { container } = renderWithProviders(<PageHeader title="Projects" subtitle="3 active" />)
    const root = container.firstElementChild as HTMLElement

    expect(root).toHaveTextContent('Projects')
    expect(root).toHaveTextContent('3 active')
    expect(root.textContent?.replace('Projects', '').replace('3 active', '').trim()).toBe('')
  })

  it('reserves meta’s place in the loading branch without announcing fake controls', () => {
    const withMeta = renderWithProviders(
      <PageHeader loading title="Fix login bug" meta={<button type="button">To Do</button>} />
    )

    // The real controls cannot render yet — their values are what is being
    // fetched — so the loading branch must not expose a "To Do" button.
    expect(withMeta.queryByRole('button', { name: 'To Do' })).not.toBeInTheDocument()

    const withMetaHeader = withMeta.getByRole('heading', { level: 1 }).closest('.border-b') as HTMLElement
    const withMetaPlaceholders = withMetaHeader.querySelectorAll('.animate-pulse')
    for (const placeholder of withMetaPlaceholders) {
      expect(placeholder.textContent).toBe('')
    }
    withMeta.unmount()

    // The title skeleton alone would already satisfy ".animate-pulse".length
    // > 0, so that assertion by itself cannot tell a real meta placeholder
    // from no placeholder at all. Render the same loading header WITHOUT
    // `meta` and require strictly fewer placeholders — the only way to prove
    // the loading branch reserves meta's own row rather than reusing the
    // title's.
    const withoutMeta = renderWithProviders(<PageHeader loading title="Fix login bug" />)
    const withoutMetaHeader = withoutMeta.getByRole('heading', { level: 1 }).closest('.border-b') as HTMLElement
    const withoutMetaPlaceholders = withoutMetaHeader.querySelectorAll('.animate-pulse')
    withoutMeta.unmount()

    expect(
      withMetaPlaceholders.length,
      'the loading header with meta must reserve strictly more placeholder space than one without it'
    ).toBeGreaterThan(withoutMetaPlaceholders.length)
  })
})
