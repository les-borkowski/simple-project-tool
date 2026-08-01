/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// This suite pins down T02: design tokens + global CSS rules added to
// src/index.css, and the deletion of the now-inert tailwind.config.js.
//
// jsdom evaluates neither the CSS cascade nor media queries, so these tests
// deliberately do NOT touch getComputedStyle. Instead they assert against:
//   1. the raw source text of src/index.css (for things a codemod/reviewer
//      can verify by reading the file), and
//   2. the real Vite-built CSS bundle (for the one claim — "does the utility
//      actually win in the cascade" — that only a real build can prove).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const CSS_PATH = path.join(FRONTEND_ROOT, 'src', 'index.css')
const TAILWIND_CONFIG_PATH = path.join(FRONTEND_ROOT, 'tailwind.config.js')

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf-8')
}

// Extracts the contents of every top-level `@layer <name> { ... }` block in
// the stylesheet by tracking brace depth, rather than a naive substring
// search. A substring search (e.g. checking whether the media query text
// appears somewhere "after" an `@layer` token) would give a false pass: it
// can't tell the difference between a rule that is textually after a layer
// block's opening brace but outside its closing brace, and one that is
// genuinely nested inside it. Tracking depth is the only reliable way to
// know whether a given snippet of text sits inside an @layer region.
function layerBlockContents(css: string): string[] {
  const blocks: string[] = []
  const layerStartRe = /@layer\b[^{]*\{/g
  let match: RegExpExecArray | null
  while ((match = layerStartRe.exec(css))) {
    const bodyStart = match.index + match[0].length
    let depth = 1
    let i = bodyStart
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    const bodyEnd = i - 1 // position of the matching closing brace
    blocks.push(css.slice(bodyStart, bodyEnd))
    layerStartRe.lastIndex = i
  }
  return blocks
}

function isWithinAnyLayerBlock(css: string, needle: string): boolean {
  const idx = css.indexOf(needle)
  if (idx === -1) throw new Error(`Expected to find "${needle}" in src/index.css before checking layer nesting`)
  return layerBlockContents(css).some((block) => block.includes(needle))
}

describe('src/index.css design tokens (T02)', () => {
  const EXPECTED_TEXT_UI_TOKENS: Record<string, string> = {
    'text-ui-2xs': '0.625rem',
    'text-ui-xs': '0.6875rem',
    'text-ui-sm': '0.75rem',
    'text-ui-md': '0.8125rem',
    'text-ui-lg': '0.875rem',
    'text-ui-xl': '0.9375rem',
    'text-ui-2xl': '1.25rem',
    'text-ui-3xl': '1.375rem',
    'text-ui-4xl': '1.625rem',
  }

  it.each(Object.entries(EXPECTED_TEXT_UI_TOKENS))(
    'declares --%s: %s in the @theme block',
    (name, value) => {
      const css = readCss()
      const re = new RegExp(`--${name}:\\s*${value.replace('.', '\\.')}\\s*;`)
      expect(
        re.test(css),
        `Expected src/index.css to declare "--${name}: ${value};" inside an @theme block, but it was not found.`,
      ).toBe(true)
    },
  )

  // T19: --spacing-topbar is consumed both as the mobile top bar's *height*
  // (h-topbar, MobileTopBar.tsx) and as the sticky *offset* every page header
  // uses to sit below it (top-topbar, PageHeader.tsx). If the top bar grows to
  // clear a notch but the token stays a bare 3rem, PageHeader slides under the
  // taller bar on a notched device. Redefining the token itself is the
  // single-point fix: on a device with no notch, env() resolves to 0px and the
  // computed result is byte-identical to the old bare 3rem, so this is safe at
  // every breakpoint including desktop (where the top bar is lg:hidden).
  it('declares --spacing-topbar as 3rem plus the top safe-area inset (T19)', () => {
    const css = readCss()
    expect(
      /--spacing-topbar:\s*calc\(\s*3rem\s*\+\s*env\(safe-area-inset-top\)\s*\)\s*;/.test(css),
      'Expected src/index.css to declare ' +
        '"--spacing-topbar: calc(3rem + env(safe-area-inset-top));" in the @theme block, so the mobile ' +
        'top bar can grow to clear a notch without PageHeader sliding under it. A bare "--spacing-topbar: 3rem;" ' +
        'no longer accounts for the inset.',
    ).toBe(true)
  })

  it('does NOT declare any --text-ui-*--line-height companion token', () => {
    const css = readCss()
    const lineHeightTokens = css.match(/--text-ui-[a-z0-9]+--line-height/g) ?? []
    expect(
      lineHeightTokens,
      'Found --text-ui-*--line-height token(s) in src/index.css: ' +
        `${lineHeightTokens.join(', ')}. These tokens are intentionally NOT part of T02 — ` +
        'adding them changes the generated text-ui-* utility from a font-size-only rule into ' +
        'a font-size+line-height rule, which would shift vertical rhythm at all 347 existing ' +
        'call sites during a later codemod. font-size-only tokens must stay font-size-only.',
    ).toEqual([])
  })

  it('declares an @theme block containing the text-ui tokens', () => {
    const css = readCss()
    const themeMatch = css.match(/@theme\s*\{/)
    expect(themeMatch, 'Expected src/index.css to contain an @theme { ... } block.').not.toBeNull()
  })
})

describe('src/index.css iOS zoom guard (T02)', () => {
  it('declares a max-width: 767.98px media query', () => {
    const css = readCss()
    expect(
      css.includes('@media (max-width: 767.98px)'),
      'Expected src/index.css to declare "@media (max-width: 767.98px) { ... }" for the iOS zoom guard.',
    ).toBe(true)
  })

  it('the zoom guard sets font-size: 16px on select and textarea', () => {
    const css = readCss()
    const mediaMatch = css.match(/@media \(max-width: 767\.98px\)\s*\{([\s\S]*?)\n\}/)
    expect(mediaMatch, 'Could not locate the iOS zoom guard media block body.').not.toBeNull()
    const body = mediaMatch ? mediaMatch[1] : ''
    expect(body.includes('select'), 'Expected the zoom guard to include a "select" selector.').toBe(true)
    expect(body.includes('textarea'), 'Expected the zoom guard to include a "textarea" selector.').toBe(true)
    expect(
      /font-size:\s*16px/.test(body),
      'Expected the zoom guard block to set "font-size: 16px".',
    ).toBe(true)
  })

  it('the zoom guard input selector excludes checkbox, radio, color, range, and file types', () => {
    const css = readCss()
    const mediaMatch = css.match(/@media \(max-width: 767\.98px\)\s*\{([\s\S]*?)\n\}/)
    expect(mediaMatch, 'Could not locate the iOS zoom guard media block body.').not.toBeNull()
    const body = mediaMatch ? mediaMatch[1] : ''
    const inputSelectorMatch = body.match(/input((?::not\([^)]*\))+)/)
    expect(
      inputSelectorMatch,
      'Expected an "input:not(...):not(...)..." selector inside the iOS zoom guard.',
    ).not.toBeNull()
    const exclusions = inputSelectorMatch ? inputSelectorMatch[1] : ''
    for (const type of ['checkbox', 'radio', 'color', 'range', 'file']) {
      expect(
        exclusions.includes(`[type="${type}"]`),
        `Expected the zoom guard's input selector to exclude type="${type}" via :not([type="${type}"]). ` +
          'Missing the "color" exclusion in particular would break ProjectStatusManager.tsx\'s ' +
          'full-size invisible input[type=color] overlay.',
      ).toBe(true)
    }
  })

  it('the zoom guard is NOT nested inside any @layer block (utilities must be able to outrank it)', () => {
    const css = readCss()
    const nested = isWithinAnyLayerBlock(css, '@media (max-width: 767.98px)')
    expect(
      nested,
      'The iOS zoom guard media query must be unlayered (declared outside any @layer block). ' +
        'Tailwind v4 emits "@layer theme, base, components, utilities" and utilities always win ' +
        'over base — if the zoom guard is placed inside @layer base (or any layer), a utility ' +
        'class like text-[12px] on the same input would silently override the 16px zoom guard.',
    ).toBe(false)
  })
})

describe('src/index.css touch/scroll utilities (T02)', () => {
  it('defines a .drag-handle utility with touch-action, -webkit-touch-callout, and user-select', () => {
    const css = readCss()
    const ruleMatch = css.match(/\.drag-handle\s*\{([^}]*)\}/)
    expect(ruleMatch, 'Expected src/index.css to declare a .drag-handle rule.').not.toBeNull()
    const body = ruleMatch ? ruleMatch[1] : ''
    expect(/touch-action:\s*none/.test(body), 'Expected .drag-handle to set "touch-action: none".').toBe(
      true,
    )
    expect(
      /-webkit-touch-callout:\s*none/.test(body),
      'Expected .drag-handle to set "-webkit-touch-callout: none" — without it, iOS\'s link-preview ' +
        'sheet hijacks long-press on draggable rows.',
    ).toBe(true)
    expect(/user-select:\s*none/.test(body), 'Expected .drag-handle to set "user-select: none".').toBe(
      true,
    )
  })

  it(
    'defines a .drag-row utility with -webkit-touch-callout and user-select, but NOT touch-action',
    () => {
      const css = readCss()
      const ruleMatch = css.match(/\.drag-row\s*\{([^}]*)\}/)
      expect(ruleMatch, 'Expected src/index.css to declare a .drag-row rule.').not.toBeNull()
      const body = ruleMatch ? ruleMatch[1] : ''
      expect(
        /-webkit-touch-callout:\s*none/.test(body),
        'Expected .drag-row to set "-webkit-touch-callout: none" — without it, iOS\'s link-preview ' +
          'sheet hijacks long-press on draggable rows.',
      ).toBe(true)
      expect(/user-select:\s*none/.test(body), 'Expected .drag-row to set "user-select: none".').toBe(
        true,
      )
      expect(
        /touch-action/.test(body),
        '.drag-row must NOT set "touch-action" (e.g. "touch-action: none"). Full-row/full-card ' +
          'draggables use .drag-row, and dnd-kit\'s delay-activated TouchSensor (250ms) needs native ' +
          'panning left alone so a finger landing on the row can still scroll the page — touch-action: ' +
          'none disables that panning from touchstart, before the activation delay can elapse, which is ' +
          'the exact regression this test guards against.',
      ).toBe(false)
    },
  )

  it('defines a .tap-safe utility', () => {
    const css = readCss()
    expect(
      /\.tap-safe\s*\{[^}]*\}/.test(css),
      'Expected src/index.css to declare a .tap-safe rule.',
    ).toBe(true)
  })

  it('defines a .scroll-fade-x utility', () => {
    const css = readCss()
    expect(
      /\.scroll-fade-x\s*\{[^}]*\}/.test(css),
      'Expected src/index.css to declare a .scroll-fade-x rule.',
    ).toBe(true)
  })
})

// T17 review fix: TimelineView's scroll container has a permanently pinned
// left column (sticky left-0), so a left-edge fade is always wrong there,
// and the container never overflows at >=1024px, so no fade should apply
// at all at that width. .scroll-fade-x-r is a right-edge-only sibling of
// .scroll-fade-x (which is left untouched — T13c's kanban board still
// depends on its both-edges shape) that is masked off entirely at the `lg`
// breakpoint.
describe('src/index.css .scroll-fade-x-r utility (T17 review fix)', () => {
  it('fades only the right edge, unlike the two-sided .scroll-fade-x', () => {
    const css = readCss()
    const ruleMatch = css.match(/\.scroll-fade-x-r\s*\{([^}]*)\}/)
    expect(ruleMatch, 'Expected src/index.css to declare a .scroll-fade-x-r rule.').not.toBeNull()
    const body = ruleMatch ? ruleMatch[1] : ''
    expect(
      /mask-image:\s*linear-gradient\(to right,\s*black/.test(body),
      `Expected .scroll-fade-x-r's mask-image to start opaque (black) at the left edge — a right-only ` +
        `fade — rather than fading from transparent like .scroll-fade-x. Got: "${body}"`,
    ).toBe(true)
    expect(
      /transparent\)\s*;/.test(body) || /transparent\)$/.test(body.trim()),
      `Expected .scroll-fade-x-r's mask-image to end transparent (fade the right edge). Got: "${body}"`,
    ).toBe(true)
  })

  it('is switched off entirely at the lg breakpoint (>=1024px), where the Gantt never overflows', () => {
    const css = readCss()
    const mediaMatch = css.match(/@media \(width\s*>=\s*64rem\)\s*\{([\s\S]*?)\n\}/)
    expect(
      mediaMatch,
      'Expected src/index.css to declare "@media (width >= 64rem) { ... }" gating .scroll-fade-x-r off.',
    ).not.toBeNull()
    const body = mediaMatch ? mediaMatch[1] : ''
    expect(
      /\.scroll-fade-x-r\s*\{[^}]*mask-image:\s*none/.test(body),
      `Expected the @media (width >= 64rem) block to set ".scroll-fade-x-r { mask-image: none; ... }". Got: "${body}"`,
    ).toBe(true)
  })

  it('.scroll-fade-x itself is unmodified: it still fades both edges', () => {
    const css = readCss()
    const ruleMatch = css.match(/(?<!-r)\.scroll-fade-x\s*\{([^}]*)\}/)
    expect(ruleMatch, 'Expected src/index.css to still declare the original .scroll-fade-x rule.').not.toBeNull()
    const body = ruleMatch ? ruleMatch[1] : ''
    expect(
      /mask-image:\s*linear-gradient\(to right,\s*transparent,\s*black/.test(body),
      `.scroll-fade-x must still start transparent then fade to black — the original two-sided shape ` +
        `T13c's kanban board scroller depends on. Got: "${body}"`,
    ).toBe(true)
  })
})

// T09: Modal and Menu createPortal() into document.body, so their subtrees are
// not descendants of AppShell's wrapper <div> — the element that carries the
// app's base "text-stone-900 dark:text-stone-100". With no colour on <body>,
// portalled text that relies on *inherited* colour fell back to the user-agent
// default (black), which is unreadable on a dark panel.
//
// What these tests prove: the stylesheet declares a base colour on <body> for
// both themes, keyed off the class-based .dark selector, and that both rules
// survive into the real built bundle.
// What they do NOT prove: that any given portalled node actually renders in
// that colour — jsdom evaluates neither the cascade nor inheritance from a
// stylesheet, so only a browser can confirm the pixels.
describe('src/index.css portal-safe base text colour (T09)', () => {
  it('sets a light-theme base colour on body matching AppShell\'s text-stone-900', () => {
    const css = readCss()
    expect(
      /(^|\})[^{}]*\bbody\b[^{}]*\{[^}]*color:\s*var\(--color-stone-900\)/m.test(css),
      'Expected src/index.css to set "color: var(--color-stone-900)" on <body>. Without a colour ' +
        'on <body>, content portalled to document.body (Modal, Menu) inherits the user-agent ' +
        'default black instead of the app base colour. The value must match AppShell.tsx\'s ' +
        'text-stone-900 exactly so in-shell rendering is unchanged.',
    ).toBe(true)
  })

  it('overrides the body colour under .dark to match AppShell\'s dark:text-stone-100', () => {
    const css = readCss()
    expect(
      /\.dark\s+body\s*\{[^}]*color:\s*var\(--color-stone-100\)/.test(css),
      'Expected src/index.css to declare ".dark body { color: var(--color-stone-100) }". Dark mode ' +
        'here is class-based (@custom-variant dark, with .dark applied to <html>), so the dark ' +
        'override must key off the .dark class — a prefers-color-scheme media query would ignore ' +
        'an explicit light/dark user preference.',
    ).toBe(true)
  })

  it('does not key the dark base colour off a prefers-color-scheme media query', () => {
    const css = readCss()
    expect(
      /@media\s*\(\s*prefers-color-scheme/.test(css),
      'src/index.css must not branch on a prefers-color-scheme media query: the theme is applied ' +
        'by toggling the .dark class on <html> (see AuthContext.applyTheme), so a media query ' +
        'would disagree with the user\'s explicit light/dark choice.',
    ).toBe(false)
  })

  it('the base colour rules are NOT nested inside any @layer block', () => {
    const css = readCss()
    expect(
      isWithinAnyLayerBlock(css, '.dark body'),
      'The base text colour rules must stay unlayered, like the rest of this stylesheet. Nothing ' +
        'else targets <body> itself, and every element that sets its own colour still beats ' +
        'inheritance, so being unlayered costs nothing and keeps the file consistent.',
    ).toBe(false)
  })
})

describe('MarkdownEditor toolbar background (T09)', () => {
  it('does not reference the non-existent stone-750 step', () => {
    const source = readFileSync(
      path.join(FRONTEND_ROOT, 'src', 'components', 'common', 'MarkdownEditor.tsx'),
      'utf-8',
    )
    expect(
      source.includes('stone-750'),
      'MarkdownEditor.tsx referenced "dark:bg-stone-750". stone-750 is not a Tailwind step and is ' +
        'not defined in the @theme block, so the class emits nothing and the toolbar keeps its ' +
        'light bg-stone-50 in dark mode — a white strip above a dark textarea. Use a real step.',
    ).toBe(false)
  })

  it('gives the toolbar a dark-mode background that is a real Tailwind step', () => {
    const source = readFileSync(
      path.join(FRONTEND_ROOT, 'src', 'components', 'common', 'MarkdownEditor.tsx'),
      'utf-8',
    )
    expect(
      source.includes('dark:bg-stone-800'),
      'Expected MarkdownEditor.tsx\'s toolbar to use "dark:bg-stone-800" — it sits between the ' +
        'dark:bg-stone-700 textarea and a stone-900 panel, and unlike stone-750 it actually emits.',
    ).toBe(true)
  })
})

// Same brace-depth technique as layerBlockContents, but for @media blocks:
// returns each top-level @media block's condition text (the header) paired
// with its body, so a test can find the specific block whose header
// mentions pointer:coarse and assert the body declares .stories-grid,
// without a naive substring search confusing "textually after" with
// "nested inside".
function mediaBlockContents(css: string): { header: string; body: string }[] {
  const blocks: { header: string; body: string }[] = []
  const mediaStartRe = /@media\s*([^{]+)\{/g
  let match: RegExpExecArray | null
  while ((match = mediaStartRe.exec(css))) {
    const header = match[1].trim()
    const bodyStart = match.index + match[0].length
    let depth = 1
    let i = bodyStart
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    const bodyEnd = i - 1
    blocks.push({ header, body: css.slice(bodyStart, bodyEnd) })
    mediaStartRe.lastIndex = i
  }
  return blocks
}

// T21 review fix 1 — stories-table row actions overflow their fixed 80px
// grid column under (pointer: coarse) at >=768px (tablet portrait). The
// approved fix widens that column ONLY under coarse pointer AND >=768px,
// via a `.stories-grid` rule. Both halves of the gate are essential: drop
// pointer:coarse and the wider column would apply to mouse/trackpad users
// too (constraint 4 says pointer:fine must stay byte-identical); drop the
// width half and the rule would also fire below `md`, where T14 deliberately
// collapses the grid to a single column — this test asserts BOTH halves are
// present so neither can be silently dropped.
describe('src/index.css .stories-grid overflow fix (T21 review fix 1)', () => {
  it('gates .stories-grid behind BOTH pointer:coarse and a >=48rem/768px width condition', () => {
    const css = readCss()
    const blocks = mediaBlockContents(css)
    const match = blocks.find(
      (b) => /pointer:\s*coarse/.test(b.header) && b.body.includes('.stories-grid'),
    )
    expect(
      match,
      'Expected a "@media (pointer: coarse) and ..." block whose body declares a .stories-grid rule. ' +
        `Found @media blocks: ${JSON.stringify(blocks.map((b) => b.header))}`,
    ).not.toBeUndefined()

    const header = match ? match.header : ''
    expect(/pointer:\s*coarse/.test(header), `Expected the block header to mention pointer:coarse. Got: "${header}"`).toBe(
      true,
    )
    expect(
      /width\s*>=\s*48rem/.test(header) || /min-width:\s*(48rem|768px)/.test(header),
      'Expected the SAME media block that gates on pointer:coarse to ALSO require a >=48rem (768px) ' +
        `width condition (e.g. "and (width >= 48rem)" or "and (min-width: 768px)"). Without this half, ` +
        'the wider column would also apply below the md breakpoint, where the grid is deliberately ' +
        `single-column (T14) — breaking mobile layout. Got header: "${header}"`,
    ).toBe(true)
  })

  it('.stories-grid widens only the last column, to 160px, leaving the first four columns unchanged', () => {
    const css = readCss()
    const blocks = mediaBlockContents(css)
    const match = blocks.find(
      (b) => /pointer:\s*coarse/.test(b.header) && b.body.includes('.stories-grid'),
    )
    expect(match, 'Expected the pointer:coarse block to declare .stories-grid before checking its value.').not.toBeUndefined()

    const body = match ? match.body : ''
    const ruleMatch = body.match(/\.stories-grid\s*\{([^}]*)\}/)
    expect(ruleMatch, `Expected a ".stories-grid { ... }" rule inside the pointer:coarse block. Got body: "${body}"`).not.toBeNull()

    const ruleBody = ruleMatch ? ruleMatch[1] : ''
    expect(
      /grid-template-columns:\s*1fr\s+120px\s+100px\s+100px\s+160px\s*;/.test(ruleBody),
      'Expected ".stories-grid" to set "grid-template-columns: 1fr 120px 100px 100px 160px;" — the ' +
        'first four tracks unchanged, the last widened from 80px to 160px (160 - 96px of Edit+Delete ' +
        `buttons - 8px gap = 56px left for the timestamp). Got: "${ruleBody}"`,
    ).toBe(true)
  })

  it('the .stories-grid rule is NOT nested inside any @layer block (must outrank the Tailwind md:grid-cols-[...] utility unlayered)', () => {
    const css = readCss()
    const nested = isWithinAnyLayerBlock(css, '.stories-grid')
    expect(
      nested,
      'The .stories-grid rule must stay unlayered, like the rest of this stylesheet (see the iOS ' +
        'zoom-guard doc comment at the top of the file). Tailwind v4 puts md:grid-cols-[...] in ' +
        '@layer utilities; an unlayered .stories-grid rule beats it without !important, but a ' +
        'layered one would lose.',
    ).toBe(false)
  })
})

describe('tailwind.config.js removal (T02)', () => {
  it('frontend/tailwind.config.js has been deleted (it is inert — no @config directive references it, dark mode is via @custom-variant)', () => {
    expect(
      existsSync(TAILWIND_CONFIG_PATH),
      `Expected ${TAILWIND_CONFIG_PATH} to be deleted as part of T02, but it still exists.`,
    ).toBe(false)
  })
})

// A source assertion proves the rule was written; only a real build proves
// Tailwind kept the --color-stone-* tokens it references (theme variables are
// tree-shaken by usage) and that the dark-mode selector survives minification.
describe('built CSS output (T09)', () => {
  let builtCssDir: string | null = null

  afterAll(() => {
    if (builtCssDir) {
      rmSync(builtCssDir, { recursive: true, force: true })
    }
  })

  it(
    'emits the body base colour for both themes, and a real background step for the MarkdownEditor toolbar',
    () => {
      builtCssDir = mkdtempSync(path.join(tmpdir(), 'sptool-index-css-t09-build-'))
      execFileSync(
        'npx',
        ['vite', 'build', '--outDir', builtCssDir, '--emptyOutDir', '--logLevel', 'error'],
        { cwd: FRONTEND_ROOT, stdio: 'pipe' },
      )

      const assetsDir = path.join(builtCssDir, 'assets')
      const files = existsSync(assetsDir) ? readdirSync(assetsDir) : []
      const cssFile = files.find((f: string) => f.endsWith('.css'))
      expect(
        cssFile,
        `Expected a built .css file in ${assetsDir}, found: ${files.join(', ') || '(none)'}`,
      ).toBeDefined()

      const builtCss = readFileSync(path.join(assetsDir, cssFile as string), 'utf-8')

      expect(
        /\bbody\{[^}]*color:var\(--color-stone-900\)/.test(builtCss),
        'Expected the built CSS to contain a body rule setting color:var(--color-stone-900).',
      ).toBe(true)
      expect(
        /\.dark body\{[^}]*color:var\(--color-stone-100\)/.test(builtCss),
        'Expected the built CSS to contain ".dark body{color:var(--color-stone-100)}".',
      ).toBe(true)
      // The referenced tokens must actually be defined: Tailwind v4 drops
      // @theme variables nothing uses, and a dangling var() would silently
      // leave <body> at the user-agent default — the exact bug being fixed.
      for (const token of ['--color-stone-900', '--color-stone-100']) {
        expect(
          new RegExp(`${token}:`).test(builtCss),
          `Expected the built CSS to define ${token}; the body colour rule references it.`,
        ).toBe(true)
      }

      // stone-750 is not a Tailwind step, so `dark:bg-stone-750` emitted
      // nothing at all. Whatever replaces it must produce a real rule.
      expect(
        builtCss.includes('dark\\:bg-stone-800'),
        'Expected the built CSS to contain a rule for dark:bg-stone-800 — proving the replacement ' +
          'for the inert stone-750 class actually emits.',
      ).toBe(true)
      expect(
        builtCss.includes('stone-750'),
        'Expected no trace of stone-750 in the built CSS.',
      ).toBe(false)
    },
    60_000,
  )
})

describe('built CSS output (T02)', () => {
  let builtCssDir: string | null = null

  afterAll(() => {
    if (builtCssDir) {
      rmSync(builtCssDir, { recursive: true, force: true })
    }
  })

  it(
    'emits a text-ui-md utility rule with a single font-size declaration (literal or var()) and no line-height, after a real Vite build',
    () => {
      builtCssDir = mkdtempSync(path.join(tmpdir(), 'sptool-index-css-build-'))

      // Real build: only way to prove the cascade/utility generation actually
      // produces the expected declaration, since jsdom cannot evaluate CSS.
      execFileSync(
        'npx',
        ['vite', 'build', '--outDir', builtCssDir, '--emptyOutDir', '--logLevel', 'error'],
        { cwd: FRONTEND_ROOT, stdio: 'pipe' },
      )

      const assetsDir = path.join(builtCssDir, 'assets')
      const files = existsSync(assetsDir) ? readdirSync(assetsDir) : []
      const cssFile = files.find((f: string) => f.endsWith('.css'))
      expect(
        cssFile,
        `Expected a built .css file in ${assetsDir}, found: ${files.join(', ') || '(none)'}`,
      ).toBeDefined()

      const builtCss = readFileSync(path.join(assetsDir, cssFile as string), 'utf-8')

      // Tailwind generates a class selector for the text-ui-md utility; find
      // the rule body regardless of exact selector escaping/minification.
      const ruleMatch = builtCss.match(/\.text-ui-md\{([^}]*)\}/)
      expect(
        ruleMatch,
        'Expected the built CSS to contain a .text-ui-md{...} rule. Full bundle length: ' +
          `${builtCss.length} chars.`,
      ).not.toBeNull()

      const body = ruleMatch ? ruleMatch[1] : ''
      // Either emission is correct: a literal value or a var() reference to
      // the --text-ui-md token declared in @theme. What matters is that
      // there is exactly one font-size source of truth (the @theme block),
      // not the specific mechanism Tailwind uses to emit it.
      expect(
        /font-size:(\.8125rem|var\(--text-ui-md\))/.test(body),
        `Expected .text-ui-md rule to set font-size to either the literal .8125rem or var(--text-ui-md), got: "${body}"`,
      ).toBe(true)
      expect(
        /line-height/.test(body),
        `Expected .text-ui-md rule to NOT include line-height — a later ticket mechanically replaces ` +
          '347 existing text-[Npx] call sites with these utilities, and a line-height companion would ' +
          `silently shift vertical rhythm at every one of those sites. Got: "${body}"`,
      ).toBe(false)
    },
    60_000,
  )
})

// T20 owns this landmine per the ledger. src/index.css's own doc-comments
// contain the literal placeholder string "text-[Npx]" (describing the later
// codemod in prose, e.g. "347 existing text-[Npx] call sites"). Tailwind v4's
// content scanner does not understand comments — it lexes candidate class
// names out of the raw file text wherever they appear — so it reads that
// placeholder as a literal arbitrary-value class and emits a rule for it:
// `.text-\[Npx\]{color:Npx}`, which is invalid CSS ("Npx" is not a valid
// color value). This is verified today by building the project and grepping
// the output. Rewording the comment (e.g. spelling it out as prose without
// the bracket-and-unit shape, or wrapping it so the scanner cannot lex it as
// a class candidate) removes the false-positive utility entirely.
//
// Note: "Npx" does NOT match the AC1 grep pattern `text-\[[0-9.]+px\]` (N is
// not a digit), so the source-lint test in typeScale.sourceLint.test.ts does
// not catch this one on its own — this is a separate, explicit assertion.
describe('src/index.css T02 invalid-CSS landmine (T20 owns the fix)', () => {
  it('the doc comments do not contain the literal placeholder "text-[Npx]"', () => {
    const css = readCss()
    expect(
      css.includes('text-[Npx]'),
      'Expected src/index.css to no longer contain the literal string "text-[Npx]" in its doc ' +
        'comments (currently near the "347 existing text-[Npx] call sites" line). Tailwind\'s content ' +
        'scanner lexes this out of the comment as if it were a real class and emits an invalid ' +
        '".text-\\[Npx\\]{color:Npx}" rule for it — reword the comment (e.g. describe the shape in ' +
        'prose instead of writing a bracketed-arbitrary-value-shaped placeholder).',
    ).toBe(false)
  })

  it(
    'the built CSS does not contain the invalid .text-\\[Npx\\]{color:Npx} rule',
    () => {
      const builtCssDir = mkdtempSync(path.join(tmpdir(), 'sptool-index-css-t20-landmine-build-'))
      try {
        execFileSync(
          'npx',
          ['vite', 'build', '--outDir', builtCssDir, '--emptyOutDir', '--logLevel', 'error'],
          { cwd: FRONTEND_ROOT, stdio: 'pipe' },
        )

        const assetsDir = path.join(builtCssDir, 'assets')
        const files = existsSync(assetsDir) ? readdirSync(assetsDir) : []
        const cssFile = files.find((f: string) => f.endsWith('.css'))
        expect(
          cssFile,
          `Expected a built .css file in ${assetsDir}, found: ${files.join(', ') || '(none)'}`,
        ).toBeDefined()

        const builtCss = readFileSync(path.join(assetsDir, cssFile as string), 'utf-8')

        expect(
          builtCss.includes('Npx'),
          'Expected the built CSS to contain no trace of "Npx" — currently it emits the invalid rule ' +
            '".text-\\[Npx\\]{color:Npx}" because src/index.css\'s own doc comments contain the literal ' +
            'string "text-[Npx]", which Tailwind\'s content scanner reads as a real arbitrary-value class.',
        ).toBe(false)
      } finally {
        rmSync(builtCssDir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
