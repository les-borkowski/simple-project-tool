import { describe, expect, it } from 'vitest'
import enGB from '../locales/en-GB.json'
import pl from '../locales/pl.json'

type LocaleTree = { [key: string]: string | LocaleTree }

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flattenKeys(tree: LocaleTree, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(tree)) {
    const dotted = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null) {
      for (const nested of flattenKeys(value, dotted)) keys.add(nested)
    } else {
      keys.add(dotted)
    }
  }
  return keys
}

function stripPluralSuffixes(keys: Set<string>): Set<string> {
  const stripped = new Set<string>()
  for (const key of keys) {
    stripped.add(key.replace(PLURAL_SUFFIX, ''))
  }
  return stripped
}

describe('locale parity', () => {
  it('en-GB and pl expose the same translation keys once plural suffixes are stripped', () => {
    // pl legitimately has more raw keys than en-GB (Polish has _few/_many plural
    // categories that English collapses into _other), so comparing raw key sets
    // would be a false failure. Comparing base keys is the real contract.
    const enKeys = stripPluralSuffixes(flattenKeys(enGB as LocaleTree))
    const plKeys = stripPluralSuffixes(flattenKeys(pl as LocaleTree))

    const onlyInEn = [...enKeys].filter((k) => !plKeys.has(k)).sort()
    const onlyInPl = [...plKeys].filter((k) => !enKeys.has(k)).sort()

    expect(onlyInEn).toEqual([])
    expect(onlyInPl).toEqual([])
  })

  // T12: the mobile hamburger's accessible name. Asserted by key rather than by
  // copy, so rewording the English string does not break the shell tests.
  it('defines a translated nav.open_menu label for the drawer trigger in both locales', () => {
    for (const [name, tree] of [
      ['en-GB', enGB],
      ['pl', pl],
    ] as const) {
      const value = (tree as Record<string, unknown>)['nav.open_menu']
      expect(typeof value, `${name} should define nav.open_menu`).toBe('string')
      expect((value as string).trim().length, `${name}'s nav.open_menu should not be blank`)
        .toBeGreaterThan(0)
    }
  })
})
