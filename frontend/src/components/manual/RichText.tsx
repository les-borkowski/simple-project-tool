import { Fragment, type ReactNode } from 'react'

/**
 * Renders the manual's inline markup:
 *
 *   **bold**   _italic_   `code`   [[kbd]]   [label](#anchor)
 *
 * Output is real React elements, never dangerouslySetInnerHTML — translated copy is
 * still copy, and escaping it is free here.
 *
 * Unmatched delimiters are left as literal text rather than swallowed, so a translator
 * who writes an apostrophe or a stray underscore sees it rendered, not vanished.
 */

// Ordered by specificity: [[kbd]] must win over [label](#anchor), and ** over _.
const PATTERN = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g

function renderRich(text: string): ReactNode[] {
  const parts = text.split(PATTERN).filter((p) => p !== '')

  return parts.map((part, i) => {
    const key = `${i}-${part.slice(0, 8)}`

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('[[') && part.endsWith(']]')) {
      return <kbd key={key}>{part.slice(2, -2)}</kbd>
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link) {
      const [, label, href] = link
      // In-page anchors stay in the SPA; anything else opens away from the app, so it
      // gets the usual noreferrer treatment.
      const external = !href.startsWith('#')
      return (
        <a
          key={key}
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {label}
        </a>
      )
    }

    return <Fragment key={key}>{part}</Fragment>
  })
}

export function RichText({ text }: { text: string }) {
  return <>{renderRich(text)}</>
}
