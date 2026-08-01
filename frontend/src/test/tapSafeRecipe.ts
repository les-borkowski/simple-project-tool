import { expect } from 'vitest'

// ---------------------------------------------------------------------------
// T21 — tap-target pass, shared assertion.
//
// `.tap-safe` (src/index.css) already exists and is correctly scoped inside
// `@media (pointer: coarse)` — it has zero adopters anywhere in src/. T21 is
// pure adoption of that existing class onto the primary controls listed in
// the ticket; this file gives every adopting test the same assertion rather
// than each one re-deriving it (the pageHeaderRecipe.ts / dvhRootRecipe.ts
// precedent for shared assertions).
//
// jsdom computes no layout (vitest.config.ts sets css: false, and
// getBoundingClientRect() is all zeros), so "is this control >=44px" is not
// something a render can prove. What IS provable from a render: whether the
// element carries the `tap-safe` token at all, and — for the one shape that
// can silently defeat it — whether it also carries a display class that lets
// min-height/min-width apply.
//
// THE TRAP: min-height / min-width do not apply to non-replaced INLINE
// elements. `<a>` (what react-router's Link/NavLink render) is `display:
// inline` by user-agent default, so `tap-safe` alone on a bare link is a
// silent no-op — it must also carry `flex`, `inline-flex`, `block`,
// `inline-block` or `grid`. `<button>` and `<div>` do not need this check:
// a bare `<button>` is `inline-block` by user-agent default already (every
// button target in this ticket keeps working even before any Tailwind
// display class is added), and a bare `<div>` is `block`. Restricting the
// check to `<a>` keeps it from failing on button controls that were never
// actually at risk.
// ---------------------------------------------------------------------------

const TAP_SAFE_CLASS = 'tap-safe'
const DISPLAY_CLASSES = ['flex', 'inline-flex', 'block', 'inline-block', 'grid']

function hasExplicitDisplayClass(tokens: string[]): boolean {
  return DISPLAY_CLASSES.some((displayClass) => tokens.includes(displayClass))
}

/**
 * Asserts a rendered control meets T21 AC1's adoption shape: it carries
 * `tap-safe`, and if it is an `<a>` (inline by UA default) it also carries an
 * explicit display class so `tap-safe`'s min-height/min-width can actually
 * apply. `description` is only used to make a failure message legible.
 */
export function expectTapSafeControl(element: HTMLElement, description: string): void {
  const tokens = Array.from(element.classList)

  expect(
    tokens,
    `${description} must carry .tap-safe so it meets the 44px touch-target guidance under (pointer: coarse)`,
  ).toContain(TAP_SAFE_CLASS)

  if (element.tagName === 'A') {
    expect(
      hasExplicitDisplayClass(tokens),
      `${description} is an <a> (display: inline by UA default) carrying .tap-safe with no ` +
        `flex/inline-flex/block/inline-block/grid class — min-height/min-width do not apply to ` +
        `non-replaced inline elements, so .tap-safe would be a silent no-op here`,
    ).toBe(true)
  }
}
