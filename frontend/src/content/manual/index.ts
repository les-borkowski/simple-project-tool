import { manualEnGB } from './en-GB'
import { manualPl } from './pl'
import type { ManualContent } from './types'

export type { Block, ManualContent, ManualSection } from './types'

const BY_LANGUAGE: Record<string, ManualContent> = {
  'en-GB': manualEnGB,
  en: manualEnGB,
  pl: manualPl,
}

/** The manual in the requested language, falling back to en-GB.
 *
 * Matches on the base tag too ("pl-PL" → "pl"), since i18next may report a region the
 * manual has no separate translation for. */
export function manualFor(language: string): ManualContent {
  return BY_LANGUAGE[language] ?? BY_LANGUAGE[language.split('-')[0]] ?? manualEnGB
}
