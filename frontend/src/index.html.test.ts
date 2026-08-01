/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T19 — dvh + safe-area sweep, AC2's enabler.
//
// Every existing `env(safe-area-inset-*)` use in the codebase (Drawer.tsx,
// Modal.tsx, and the ones this ticket adds) is inert without
// `viewport-fit=cover` on the viewport meta tag: without it, Safari never
// extends the viewport under the notch/home-indicator area, so `env()`
// resolves to 0px everywhere regardless of what CSS asks for it.
//
// index.html lives outside src/, and it is not a React tree, so this is a
// plain file-read assertion rather than a render.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const INDEX_HTML_PATH = path.join(FRONTEND_ROOT, 'index.html')

function readIndexHtml(): string {
  return readFileSync(INDEX_HTML_PATH, 'utf-8')
}

function viewportMetaContent(html: string): string {
  const match = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)
  expect(match, 'expected a <meta name="viewport" content="..."> tag in index.html').not.toBeNull()
  return match![1]
}

describe('index.html viewport meta tag (T19 AC2 enabler)', () => {
  it('opts into env(safe-area-inset-*) resolving via viewport-fit=cover', () => {
    const content = viewportMetaContent(readIndexHtml())
    expect(
      content,
      'viewport-fit=cover is required for env(safe-area-inset-*) to resolve to anything but 0px on iOS Safari',
    ).toContain('viewport-fit=cover')
  })

  it('keeps the existing width/scale directives alongside viewport-fit=cover', () => {
    const content = viewportMetaContent(readIndexHtml())
    expect(content).toContain('width=device-width')
    expect(content).toContain('initial-scale=1.0')
  })
})
