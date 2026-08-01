/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Defect I1 (final whole-branch review) — the board's edge-fade mask erases
// the drag preview.
//
// ProjectDetailPage.tsx's kanban scroller carries `scroll-fade-x` (a
// mask-image gradient, src/index.css). <DndContext> renders INSIDE that div,
// and dnd-kit's <DragOverlay> (rendered with `position: fixed`) is a
// descendant of <DndContext>. A CSS mask on an ancestor clips fixed
// descendants — verified in headless Chrome, recorded in the ticket — so
// dragging a card past the scroller's edges makes the drag preview vanish or
// fade through the 24px gradient.
//
// ASSERTION STRATEGY — chosen and why:
//
// vitest.config.ts sets `css: false` and jsdom computes no layout, so the
// masking/clipping effect itself cannot be measured or even rendered
// (jsdom does not implement mask-image at all). A live-drag rendered
// assertion was considered and rejected: dnd-kit's DragOverlay only mounts
// content while a drag is active, and driving a real pointer/keyboard drag
// through dnd-kit's sensors depends on timers and pointer-event internals
// jsdom does not model reliably — the exact reason this codebase's other
// dnd-kit tests (ProjectDetailPage.board.test.tsx, ProjectStatusManager
// .reorder.test.tsx) explicitly avoid simulating a live drag and fall back to
// either non-drag interactions or source-level assertions instead.
//
// So this is a source-lint test, in the style of dragTouchSensors
// .sourceLint.test.ts and index.css.test.ts: it reads the real source file
// and asserts on the DOM-nesting invariant the fix establishes — that
// <DragOverlay> must not be a descendant of the div carrying
// `scroll-fade-x`. It parses the JSX by tracking <div>/</div> nesting depth
// from the `scroll-fade-x` div's opening tag to find where that specific div
// closes, then checks whether <DragOverlay appears before that close.
//
// LIMITATION: this proves the structural cause is fixed (DragOverlay hoisted
// out from under the masked div), not the visual symptom (nothing is clipped
// during a live drag) — that remains a browser-pass / device-pass concern per
// the ticket's own instructions.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_PATH = path.join(__dirname, 'ProjectDetailPage.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf-8')
}

/**
 * Given source text and the index of a `<div` opening tag's `<`, returns the
 * index just past that div's matching `</div>`, by tracking nesting depth
 * across every subsequent `<div` / `</div>` token. Self-closing divs are not
 * a thing in this codebase's JSX, so they are not special-cased.
 */
function findMatchingDivClose(source: string, openTagStart: number): number {
  // Self-closing divs (`<div ... />`, e.g. the status-dot spans elsewhere in
  // this file) must not shift the depth counter — only a real opening tag
  // (no trailing `/` before its closing `>`) pushes depth, and only a real
  // `</div>` pops it.
  const divTagPattern = /<div\b[^>]*\/>|<div\b[^>]*>|<\/div>/g
  divTagPattern.lastIndex = openTagStart
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = divTagPattern.exec(source)) !== null) {
    const tag = match[0]
    if (tag === '</div>') {
      depth -= 1
      if (depth === 0) {
        return match.index + tag.length
      }
    } else if (tag.endsWith('/>')) {
      // Self-closing — depth-neutral, skip.
      continue
    } else {
      depth += 1
    }
  }
  throw new Error('Could not find a matching </div> for the scroll-fade-x div — source shape has changed')
}

describe('the kanban scroller and its DragOverlay must not nest the overlay under the mask (defect I1)', () => {
  it('scroll-fade-x div does not contain <DragOverlay> as a descendant', () => {
    const source = readSource()

    const maskClassIndex = source.indexOf('scroll-fade-x')
    expect(maskClassIndex, 'expected to find the scroll-fade-x class on the kanban scroller div').toBeGreaterThan(-1)

    // Walk back from the class-name occurrence to the start of its enclosing
    // <div opening tag.
    const openTagStart = source.lastIndexOf('<div', maskClassIndex)
    expect(openTagStart, 'expected scroll-fade-x to sit inside a <div ...> opening tag').toBeGreaterThan(-1)

    const closeTagEnd = findMatchingDivClose(source, openTagStart)
    const maskedRegion = source.slice(openTagStart, closeTagEnd)

    expect(
      maskedRegion.includes('<DragOverlay'),
      'Expected <DragOverlay> to NOT be nested inside the div carrying `scroll-fade-x` (a mask-image ' +
        'gradient). DragOverlay renders with position: fixed, and a CSS mask on an ancestor clips fixed ' +
        'descendants, so the drag preview is erased or clipped whenever a card is dragged near/past the ' +
        "scroller's edges. Fix: hoist <DndContext> to wrap the masked div, so <DragOverlay> becomes a " +
        'sibling of the masked div rather than a descendant.',
    ).toBe(false)
  })
})
