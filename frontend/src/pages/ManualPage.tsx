import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/layout/PageHeader'
import { RichText } from '../components/manual/RichText'
import { manualFor } from '../content/manual'
import type { Block, ManualSection } from '../content/manual'

function sectionFromHash(hash: string, sections: readonly ManualSection[]): string | null {
  const id = hash.replace(/^#/, '')
  return sections.some((s) => s.id === id) ? id : null
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="manual-table">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>
                <RichText text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <RichText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Callout({
  kind,
  label,
  children,
}: {
  kind: 'note' | 'tip' | 'warn'
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={`manual-callout manual-callout-${kind}`}>
      <p className="manual-callout-label">{label}</p>
      {children}
    </div>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case 'h3':
      return <h3>{block.text}</h3>
    case 'h4':
      return <h4>{block.text}</h4>
    case 'p':
      return (
        <p>
          <RichText text={block.text} />
        </p>
      )
    case 'path':
      return <p className="manual-path">{block.text}</p>
    case 'ul':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ol>
      )
    case 'pre':
      return (
        <pre>
          <code>{block.code}</code>
        </pre>
      )
    case 'callout':
      return (
        <Callout kind={block.kind} label={block.label}>
          <p>
            <RichText text={block.text} />
          </p>
        </Callout>
      )
    case 'table':
      return <Table head={block.head} rows={block.rows} />
  }
}

export function ManualPage() {
  const { i18n } = useTranslation()
  const { hash } = useLocation()

  // All copy lives in the per-locale content modules, so switching language switches
  // the whole document rather than just its title.
  const manual = manualFor(i18n.language)
  const { sections } = manual

  // Seeded from the hash, not just from the first section: on a deep link the
  // browser jumps straight to the anchor, which the observer below cannot
  // see — it reports the positions from before the jump and then stays quiet
  // until something crosses its band, so the rail would mark the wrong entry
  // until the reader scrolled.
  //
  // Only the initial value reads the hash. Nothing syncs it afterwards on
  // purpose: the contents links are plain in-page anchors, so following one
  // scrolls, and scrolling is exactly what the observer below is watching.
  const [active, setActive] = useState<string>(
    () => sectionFromHash(hash, sections) ?? sections[0].id
  )

  // Highlights the contents entry for whichever section is in view. The
  // observer reports many sections at once on a tall screen, so the first in
  // document order wins — that is the one whose heading the reader has most
  // recently passed.
  //
  // Section ids are identical across languages, so a language switch does not
  // disturb the observer or invalidate a deep link.
  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const current = sections.find((s) => visible.has(s.id))
        if (current) setActive(current.id)
      },
      { rootMargin: '-10% 0px -70% 0px' }
    )

    for (const { id } of sections) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title={manual.title} subtitle={manual.subtitle} />

      <div className="flex-1 px-4 py-5 md:px-7 md:py-6 min-w-0">
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] max-w-4xl">
          <nav className="manual-toc text-ui-md" aria-label={manual.contentsLabel}>
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? 'location' : undefined}
                    className={active === s.id ? 'is-active' : undefined}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="manual-prose min-w-0">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2>{section.heading}</h2>
                {section.blocks.map((block, i) => (
                  <BlockView key={i} block={block} />
                ))}
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  )
}
