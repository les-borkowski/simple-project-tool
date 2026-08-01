import { expect } from 'vitest'

// ---------------------------------------------------------------------------
// T19 — dvh + safe-area sweep, AC1.
//
// LoginPage, RegisterPage, ConfirmEmailPage, ResetPasswordPage, and
// ProtectedRoute each converge on the same root-container assertion, so it
// lives here once rather than being copied into every page's test file —
// the pageHeaderRecipe.ts precedent (T09 AC1) for the same kind of
// duplication.
//
// The retired full-viewport height class does not subtract mobile browser
// chrome (the address bar that shows/hides on scroll) from the static
// viewport, so content sized with it gets clipped underneath; the dvh-based
// class tracks the *dynamic* viewport instead and never clips.
//
// jsdom computes no layout, so this is a class-token assertion, never a
// measured height.
//
// This file lives outside *.test.ts (like pageHeaderRecipe.ts), so
// viewportUnits.sourceLint.test.ts scans it as production source. The
// retired class name below is therefore built via string concatenation
// rather than spelled as a literal, the same self-protection technique that
// lint file uses on itself, so this helper does not trip its own guard.
// ---------------------------------------------------------------------------

const DVH_HEIGHT_CLASS = 'min-h-dvh'
const RETIRED_HEIGHT_CLASS = ['min-h', '-', 'screen'].join('')

export function expectDvhRoot(root: HTMLElement): void {
  const tokens = Array.from(root.classList)

  expect(
    tokens,
    'the retired full-viewport height class does not subtract mobile browser chrome from the static ' +
      'viewport, clipping content under it. Use the dvh-based class instead.',
  ).toContain(DVH_HEIGHT_CLASS)
  expect(tokens).not.toContain(RETIRED_HEIGHT_CLASS)
}
