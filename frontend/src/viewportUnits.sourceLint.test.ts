/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T19 — dvh + safe-area sweep, AC1.
//
// `100vh`-based units (`min-h-screen`, `h-screen`) do not account for mobile
// browser chrome (the address bar that shows/hides on scroll): the bottom of
// the page gets clipped under it. `min-h-dvh` / `h-dvh` track the *dynamic*
// viewport instead, so content never sits under retracting/expanding chrome.
//
// This file is a source-lint test in the style of
// src/dragTouchSensors.sourceLint.test.ts: it reads real source files and
// asserts on their text, because "does this class appear anywhere in src/" is
// not something a jsdom render can prove or disprove (vitest.config.ts sets
// css: false, so jsdom never resolves a Tailwind class to a computed style).
//
// Both forbidden classes are covered by a single needle: `min-h-screen`
// CONTAINS `h-screen` as a substring, so searching for `h-screen` alone finds
// every site that uses either class without double-reporting the ones that
// use `min-h-screen`.
//
// The needle is built via string concatenation, and this file never spells
// the raw class as a literal, so a repo-wide scan of this identifier does not
// match its own source.
//
// Scope: non-test .ts/.tsx files only. AppShell.drawer.test.tsx:364
// legitimately contains the literal `min-h-screen` — it asserts that no
// *rendered* element carries it, which is a DOM-absence assertion, not a
// source occurrence of the string. Excluding tests is safe here because tests
// only assert on what production renders: if production is clean, a test that
// still asserts the old class would fail entirely on its own (its query would
// find nothing), so leaving test files out of the source scan does not let a
// production regression slip through unnoticed.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = __dirname
const FORBIDDEN_UNIT = ['h', '-', 'screen'].join('')

function listNonTestFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue
      files.push(...listNonTestFilesRecursively(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

describe('no dvh-unaware viewport unit remains in production source (T19 AC1)', () => {
  it(`grep -rnE "min-${FORBIDDEN_UNIT}|${FORBIDDEN_UNIT}" src/ (excluding *.test.*) returns nothing`, () => {
    const files = listNonTestFilesRecursively(SRC_ROOT)
    const hits: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(FORBIDDEN_UNIT)) {
        hits.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(
      hits,
      `Expected no production source file under src/ to use the 100vh-based "${FORBIDDEN_UNIT}" ` +
        `unit (as a bare class or inside "min-${FORBIDDEN_UNIT}"). Found it in: ${hits.join(', ') || '(none)'}. ` +
        'Mobile browser chrome (address bar) is not subtracted from 100vh, so content sized with it gets ' +
        `clipped; replace with the dvh-based equivalent ("${FORBIDDEN_UNIT}" -> "h-dvh", "min-${FORBIDDEN_UNIT}" -> "min-h-dvh").`,
    ).toEqual([])
  })

  // T19 scope extension (approved) — AC1 was written as a grep for the two
  // Tailwind classes above, and misses the literal `100vh` used inline in a
  // style/prop value (not a class). `MarkdownEditor`'s `maxHeight` prop is set
  // to `calc(100vh - 240px)` on two detail pages: on a phone with the address
  // bar showing, 100vh exceeds the visible viewport, so the editor renders
  // taller than the screen — the exact clipping T19 exists to remove.
  //
  // This needle is deliberately the literal string "100vh", not a general
  // "vh" match: two sites legitimately keep raw `vh` and must NOT be flagged
  // here — CommandPalette.tsx's `pt-[10vh] md:pt-[20vh]` (a percentage offset
  // from the top, not a height) and NotFoundPage.tsx's `min-h-[60vh]` (soft
  // centring where the unit has no practical effect). Both are explicit,
  // approved exceptions.
  //
  // Built via string concatenation to match FORBIDDEN_UNIT's pattern above.
  // Note that, unlike FORBIDDEN_UNIT, this buys no self-match protection: the
  // literal appears several times in the comments and failure messages of this
  // very file. What actually keeps this file out of its own scan is
  // listNonTestFilesRecursively() skipping *.test.ts(x). If that exclusion is
  // ever narrowed, this file becomes a false positive — fix it there, and do
  // not trust the concatenation to save you.
  const FORBIDDEN_FULL_VIEWPORT_HEIGHT = ['1', '0', '0', 'v', 'h'].join('')

  it(`grep -rn "${FORBIDDEN_FULL_VIEWPORT_HEIGHT}" src/ (excluding *.test.*) returns nothing`, () => {
    const files = listNonTestFilesRecursively(SRC_ROOT)
    const hits: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(FORBIDDEN_FULL_VIEWPORT_HEIGHT)) {
        hits.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(
      hits,
      `Expected no production source file under src/ to use the literal "${FORBIDDEN_FULL_VIEWPORT_HEIGHT}" ` +
        `viewport unit (e.g. inside a style prop like maxHeight="calc(${FORBIDDEN_FULL_VIEWPORT_HEIGHT} - 240px)"). ` +
        `Found it in: ${hits.join(', ') || '(none)'}. ` +
        'Mobile browser chrome (address bar) is not subtracted from 100vh, so content sized with it gets ' +
        `clipped; replace with the dvh-based equivalent (e.g. "calc(100dvh - 240px)"). Note: bare "vh" ` +
        'usages such as pt-[10vh] (a top offset, not a height) and min-h-[60vh] (soft centring) are ' +
        'deliberately out of scope for this check.',
    ).toEqual([])
  })
})
