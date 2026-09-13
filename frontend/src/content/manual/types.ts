/** The manual's content model.
 *
 * The manual is ~4,000 words of prose. Held as JSX in the page component it could only
 * ever exist in one language, which is why it shipped untranslated. Held as data, adding
 * a language is a pure translation job against a typed structure, and the page component
 * stops carrying any copy at all.
 *
 * Inline emphasis inside `text` uses the small markup that RichText understands:
 *   **bold**   _italic_   `code`   [[kbd]]   [label](#anchor)
 * Deliberately tiny — enough for this document, small enough that a translator can see
 * the whole grammar at a glance.
 */

export type Block =
  | { t: 'h3'; text: string }
  | { t: 'h4'; text: string }
  | { t: 'p'; text: string }
  | { t: 'path'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'pre'; code: string }
  | { t: 'callout'; kind: 'note' | 'tip' | 'warn'; label: string; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }

export interface ManualSection {
  /** Stable anchor id — never translated; deep links and the scroll-spy key off it. */
  id: string
  label: string
  heading: string
  blocks: Block[]
}

export interface ManualContent {
  title: string
  subtitle: string
  contentsLabel: string
  /** Banner above the whole document, for anything true of this translation rather
   *  than of the product — e.g. that it is machine-translated and unreviewed. Per
   *  locale on purpose, so it stays out of the section parity checks. */
  notice?: Extract<Block, { t: 'callout' }>
  sections: ManualSection[]
}
