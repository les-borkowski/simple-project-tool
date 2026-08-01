import { expect } from 'vitest'

// ---------------------------------------------------------------------------
// The one page-header recipe (T09 AC1), asserted from one place.
//
// Every page that adopts PageHeader converges on the same container classes, so
// the assertion lives here rather than being copied into each page's test file:
// a page drifting back to its own padding fails the same helper everyone else
// passes, and the recipe has exactly one definition to update when it changes.
//
// "Uses PageHeader" is not directly observable from the DOM (a component
// boundary is an internal), so it is asserted through its user-visible
// consequence: the header element around the <h1> carries exactly the canonical
// recipe and the shared sticky offset. A page that keeps its old hand-rolled
// header fails these; a page that inlines the canonical classes by hand passes
// them, and that is fine — the rendered result is what users get.
// ---------------------------------------------------------------------------

const CANONICAL_PADDING = ['px-4', 'pt-4', 'pb-3', 'md:px-7', 'md:pt-5', 'md:pb-3']
const DRIFTED_PADDING = ['px-7', 'pt-6', 'pb-4', 'pt-5']

/**
 * The page header block: the nearest ancestor of the page's <h1> that draws the
 * bottom rule. All four pre-T09 headers were `border-b border-stone-200 ...`, so
 * this finds the old markup as readily as the new, which is what makes the
 * padding assertion below a real red/green signal rather than a lookup miss.
 */
export function pageHeaderAround(heading: HTMLElement): HTMLElement {
  const root = heading.closest('.border-b')
  expect(root, 'the page header should still draw its bottom rule').not.toBeNull()
  return root as HTMLElement
}

export function expectCanonicalHeader(heading: HTMLElement): HTMLElement {
  const root = pageHeaderAround(heading)
  // Class tokens are read off `classList` so `px-7` cannot accidentally match
  // inside `md:px-7`.
  const tokens = Array.from(root.classList)

  expect(tokens, 'header must use the canonical PageHeader padding recipe').toEqual(
    expect.arrayContaining(CANONICAL_PADDING)
  )
  for (const drifted of DRIFTED_PADDING) {
    expect(tokens, `header still carries the retired "${drifted}" padding`).not.toContain(drifted)
  }
  expect(tokens, 'header must stick below the mobile top bar').toContain('sticky')
  expect(tokens, 'sticky offset must come from the --spacing-topbar token').toContain('top-topbar')
  expect(tokens, 'header must sit flush with the top of the desktop shell').toContain('lg:top-0')

  return root
}
