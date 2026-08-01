/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T21 — tap-target pass, AC2 ("Desktop density is byte-identical — no
// tap-safe rule applies at (pointer: fine)"), asserted structurally rather
// than through jsdom (vitest.config.ts sets css: false and jsdom computes no
// layout at all, so there is no way to ask "does this rule apply at this
// pointer type" from a render).
//
// Style in the house pattern of viewportUnits.sourceLint.test.ts /
// typeScale.sourceLint.test.ts: read real source files and assert on their
// text.
//
// Both checks below currently PASS: `.tap-safe` (src/index.css) already
// exists, already sits inside `@media (pointer: coarse)`, and no production
// file yet uses a bare min-h-[44px]/min-w-[44px]. That is expected — this is
// pre-existing, correctly-scoped infrastructure with zero adopters (see
// ground truth), not something T21 needs to build. It stays here as a
// regression guard: it is what makes "adopt .tap-safe everywhere, but never
// add an unconditional 44px rule instead" enforceable rather than a promise.
// The RED evidence for T21 lives in the adoption tests (AppShell.drawer,
// Tabs.tapSafe, ProjectsPage.tapSafe, ProjectDetailPage.tapSafe,
// ConfirmDialog), which fail today because `tap-safe` is not yet on any of
// the controls in scope.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = __dirname
const INDEX_CSS_PATH = path.join(SRC_ROOT, 'index.css')

function listScannableFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue
      files.push(...listScannableFilesRecursively(full))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

describe('the 44px tap-target declarations only ever live inside .tap-safe, gated on (pointer: coarse) (T21 AC2)', () => {
  it('src/index.css has exactly one min-height:44px / min-width:44px pair, and it sits inside .tap-safe\'s @media (pointer: coarse) block', () => {
    const css = readFileSync(INDEX_CSS_PATH, 'utf-8')

    const tapSafeMatch = css.match(/\.tap-safe\s*\{[\s\S]*?\n\}\n/)
    expect(tapSafeMatch, 'expected a .tap-safe rule in src/index.css').not.toBeNull()
    const tapSafeBlock = (tapSafeMatch as RegExpMatchArray)[0]

    // The min-height/min-width declarations must be textually inside a
    // `@media (pointer: coarse) { ... }` that is itself inside .tap-safe —
    // not merely somewhere in the same file.
    const mediaMatch = tapSafeBlock.match(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?)\}/)
    expect(
      mediaMatch,
      '.tap-safe must gate its sizing behind @media (pointer: coarse), or it would apply desktop-wide ' +
        'with a mouse/trackpad too, breaching "desktop density is byte-identical"',
    ).not.toBeNull()
    const mediaBody = (mediaMatch as RegExpMatchArray)[1]

    expect(mediaBody).toMatch(/min-height:\s*44px/)
    expect(mediaBody).toMatch(/min-width:\s*44px/)

    // And nowhere ELSE in index.css — a second, unguarded declaration would
    // silently apply at every pointer type regardless of what .tap-safe does.
    const rest = css.replace(tapSafeBlock, '')
    expect(rest, 'a min-height:44px outside .tap-safe would apply at (pointer: fine) too').not.toMatch(
      /min-height:\s*44px/,
    )
    expect(rest, 'a min-width:44px outside .tap-safe would apply at (pointer: fine) too').not.toMatch(
      /min-width:\s*44px/,
    )
  })

  // Built via string concatenation so this file's own prose above (which
  // spells "min-h-[44px]" out in this very sentence) is not itself flagged —
  // matching the self-protection technique in viewportUnits.sourceLint.test.ts
  // and typeScale.sourceLint.test.ts. As those files note, what actually keeps
  // THIS file out of its own scan is listScannableFilesRecursively excluding
  // *.test.ts(x) by filename; the concatenation only keeps the needle from
  // matching the sentence you are reading right now.
  const FORBIDDEN_MIN_HEIGHT_CLASS = ['min-h-', '[44px]'].join('')
  const FORBIDDEN_MIN_WIDTH_CLASS = ['min-w-', '[44px]'].join('')

  it('no production .ts/.tsx file uses a bare min-h-[44px] or min-w-[44px] Tailwind class', () => {
    const files = listScannableFilesRecursively(SRC_ROOT)
    const hits: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(FORBIDDEN_MIN_HEIGHT_CLASS) || content.includes(FORBIDDEN_MIN_WIDTH_CLASS)) {
        hits.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(
      hits,
      `Expected no production source file under src/ to use an unconditional ${FORBIDDEN_MIN_HEIGHT_CLASS} ` +
        `or ${FORBIDDEN_MIN_WIDTH_CLASS} class. Found it in: ${hits.join(', ') || '(none)'}. Such a class ` +
        'would apply the 44px floor at every pointer type, including a mouse/trackpad, breaching ' +
        '"desktop density is byte-identical" — use the .tap-safe class instead, which is already gated ' +
        'behind (pointer: coarse).',
    ).toEqual([])
  })
})
