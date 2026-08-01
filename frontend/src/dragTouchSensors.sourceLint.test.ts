/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// T05: dnd-kit touch sensors. The dnd-kit sensor that handles both mouse and
// touch input takes precedence over a dedicated touch sensor when the two
// are combined — so if that pointer-based sensor is present anywhere, the
// touch activation constraint (delay: 250, tolerance: 8) added by
// useDragSensors() would never apply, and a finger scrolling a board would
// immediately start a drag instead.
//
// This file is a source-lint test in the style of src/index.css.test.ts: it
// reads real source files and asserts on their text, because "does this
// identifier appear anywhere in src/" is not something a jsdom render can
// prove or disprove.
//
// The identifier under test is built via string concatenation rather than
// written as a literal anywhere in this file (including comments/labels),
// so that this file does not match its own repo-wide source scan.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = __dirname
const LEGACY_DUAL_INPUT_SENSOR_NAME = ['Pointer', 'Sensor'].join('')

function listFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue
      files.push(...listFilesRecursively(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

describe(`the legacy dual-input sensor must not appear anywhere in src/ (T05)`, () => {
  it(`grep -rn "${LEGACY_DUAL_INPUT_SENSOR_NAME}" src/ returns nothing`, () => {
    const files = listFilesRecursively(SRC_ROOT)
    const hits: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      if (content.includes(LEGACY_DUAL_INPUT_SENSOR_NAME)) {
        hits.push(path.relative(SRC_ROOT, file))
      }
    }
    expect(
      hits,
      `Expected no source file under src/ to reference ${LEGACY_DUAL_INPUT_SENSOR_NAME}. Found it in: ` +
        `${hits.join(', ') || '(none)'}. That sensor handles both mouse and touch input and takes ` +
        'precedence over a dedicated touch sensor, so its presence anywhere would defeat the touch ' +
        'activation constraint (delay: 250, tolerance: 8) that useDragSensors() is supposed to add.',
    ).toEqual([])
  })
})

describe('board/sortable drag sites use useDragSensors() instead of building their own sensor list (T05)', () => {
  const SITES = [
    path.join(SRC_ROOT, 'pages', 'ProjectDetailPage.tsx'),
    path.join(SRC_ROOT, 'pages', 'SprintView.tsx'),
    path.join(SRC_ROOT, 'components', 'settings', 'TabConfigPanel.tsx'),
  ]

  it.each(SITES)('%s imports useDragSensors', (filePath) => {
    const content = readFileSync(filePath, 'utf-8')
    expect(
      /useDragSensors/.test(content),
      `Expected ${path.relative(SRC_ROOT, filePath)} to call useDragSensors() (from src/hooks/useDragSensors) ` +
        'instead of assembling its own useSensors(useSensor(...)) list inline.',
    ).toBe(true)
  })
})
