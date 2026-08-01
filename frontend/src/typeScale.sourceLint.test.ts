/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T20 — type-scale codemod, AC1.
//
// Ad-hoc arbitrary-value font sizes (`text-[12px]`, `text-[12.5px]`, ...)
// are scattered across production source instead of using the 9-step
// --text-ui-* scale defined in T02 (src/index.css @theme block). This is a
// source-lint test in the style of src/viewportUnits.sourceLint.test.ts: it
// reads real source files and asserts on their text, because "does this
// class appear anywhere in src/" is not something a jsdom render can prove
// or disprove (vitest.config.ts sets css: false, so jsdom never resolves a
// Tailwind class to a computed style, and there are 300+ call sites — far
// too many to assert individually via rendered output).
//
// Scope: NON-test .ts/.tsx files, PLUS .css files. Unlike T19's viewport-unit
// lint (which only needed .ts/.tsx), this one must also scan src/index.css:
// its own doc-comments contain two literal `text-[Npx]`-shaped strings
// (see src/index.css.test.ts and src/index.css around lines 9 and 29), one
// of which (`text-[12px]`, line 9) matches this exact needle and must be
// reworded, not just the 323 real component call sites.
//
// The needle is built via string concatenation, matching the house style in
// viewportUnits.sourceLint.test.ts. IMPORTANT — unlike that file's
// self-description, concatenation buys NO self-protection here either: what
// actually keeps a source-lint test file from flagging itself is that
// listNonTestFilesRecursively() below excludes *.test.ts(x) by filename, not
// the string-concatenation trick. This file's own module-scope RegExp
// literal is deliberately never written as the bare pattern in prose within
// this comment for readability, but that is incidental, not a safety net —
// do not trust concatenation over there either.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = __dirname

// Matches Tailwind arbitrary-value font-size classes like text-[12px],
// text-[12.5px], text-[9px]. Built from parts so the literal pattern is not
// spelled out directly in this file's source (it would otherwise trip on
// itself if the test-file exclusion below were ever narrowed — see the
// caution above).
const NEEDLE_PARTS = ['text', '-', '\\[', '[0-9.]', '+', 'px', '\\]'].join('')
const FORBIDDEN_ARBITRARY_TEXT_SIZE = new RegExp(NEEDLE_PARTS)

function listScannableFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue
      files.push(...listScannableFilesRecursively(full))
    } else if (/\.(ts|tsx|css)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

describe('no ad-hoc arbitrary text-size class remains in production source (T20 AC1)', () => {
  it('grep -rE "text-\\[[0-9.]+px\\]" src (excluding *.test.*) returns nothing', () => {
    const files = listScannableFilesRecursively(SRC_ROOT)
    const hits: { file: string; matches: string[] }[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const matches = content.match(new RegExp(FORBIDDEN_ARBITRARY_TEXT_SIZE.source, 'g'))
      if (matches && matches.length > 0) {
        hits.push({ file: path.relative(SRC_ROOT, file), matches })
      }
    }
    const totalHits = hits.reduce((sum, h) => sum + h.matches.length, 0)
    expect(
      hits,
      `Expected no production source file under src/ (including .css) to use an ad-hoc ` +
        `text-[Npx] arbitrary-value font size. Found ${totalHits} occurrence(s) across ` +
        `${hits.length} file(s): ${hits.map((h) => `${h.file} (${h.matches.length})`).join(', ') || '(none)'}. ` +
        'Every site should be replaced with the matching step on the 9-value --text-ui-* scale ' +
        'declared in src/index.css (text-ui-2xs .. text-ui-4xl), per the T20 rounding table.',
    ).toEqual([])
  })
})
