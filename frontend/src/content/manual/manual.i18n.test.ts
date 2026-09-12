import { describe, expect, it } from 'vitest'
import { manualEnGB } from './en-GB'
import { manualFor } from './index'
import { manualPl } from './pl'
import type { Block } from './types'

// The manual used to be 574 lines of hardcoded English in the page component, so a `pl`
// user clicking "Pomoc" landed on an entirely English document. These pin that both
// translations exist and stay structurally in step, which is the thing that silently
// rots when someone adds a section to one and not the other.

function blockShapes(blocks: Block[]): string[] {
  return blocks.map((b) => b.t)
}

describe('manual content', () => {
  it('resolves Polish for pl and English for en-GB', () => {
    expect(manualFor('pl')).toBe(manualPl)
    expect(manualFor('en-GB')).toBe(manualEnGB)
  })

  it('falls back to English for an unknown language', () => {
    expect(manualFor('fr')).toBe(manualEnGB)
  })

  it('matches on the base tag when a region has no separate translation', () => {
    expect(manualFor('pl-PL')).toBe(manualPl)
  })

  it('has the same sections in the same order in both languages', () => {
    expect(manualPl.sections.map((s) => s.id)).toEqual(manualEnGB.sections.map((s) => s.id))
  })

  it('has the same block structure per section in both languages', () => {
    for (const [i, en] of manualEnGB.sections.entries()) {
      const pl = manualPl.sections[i]
      expect(blockShapes(pl.blocks), `section ${en.id}`).toEqual(blockShapes(en.blocks))
    }
  })

  it('keeps table dimensions identical across languages', () => {
    for (const [i, en] of manualEnGB.sections.entries()) {
      const pl = manualPl.sections[i]
      for (const [j, block] of en.blocks.entries()) {
        if (block.t !== 'table') continue
        const plBlock = pl.blocks[j]
        expect(plBlock.t).toBe('table')
        if (plBlock.t !== 'table') continue
        expect(plBlock.head.length, `${en.id} table head`).toBe(block.head.length)
        expect(plBlock.rows.length, `${en.id} table rows`).toBe(block.rows.length)
      }
    }
  })

  it('never translates a command name or a flag inside a code block', () => {
    // Comments, quoted strings and example filenames may legitimately be localised —
    // `notes.txt` becoming `notatki.txt` is a better translation, not a bug. Command
    // names and flags must not be: a reader who types a translated flag gets an error.
    const invariants = (code: string) =>
      code
        .split('\n')
        .flatMap((line) => line.split('#')[0].replace(/"[^"]*"/g, '').trim().split(/\s+/))
        .filter((token) => token === 'spt' || token === 'spt-mcp' || token.startsWith('-'))
        .filter((token) => token !== '-')

    for (const [i, en] of manualEnGB.sections.entries()) {
      const pl = manualPl.sections[i]
      for (const [j, block] of en.blocks.entries()) {
        if (block.t !== 'pre') continue
        const plBlock = pl.blocks[j]
        if (plBlock.t !== 'pre') continue
        expect(invariants(plBlock.code), `${en.id} code`).toEqual(invariants(block.code))
      }
    }
  })

  it('leaves no untranslated section label in Polish', () => {
    const identical = manualPl.sections.filter(
      (pl, i) => pl.label === manualEnGB.sections[i].label
    )
    expect(identical.map((s) => s.id)).toEqual([])
  })

  it('uses only anchors that exist as section ids', () => {
    const ids = new Set(manualEnGB.sections.map((s) => s.id))
    const anchorPattern = /\]\((#[^)]+)\)/g

    for (const content of [manualEnGB, manualPl]) {
      for (const section of content.sections) {
        const text = JSON.stringify(section.blocks)
        for (const match of text.matchAll(anchorPattern)) {
          expect(ids, `${section.id} links to ${match[1]}`).toContain(match[1].slice(1))
        }
      }
    }
  })
})
