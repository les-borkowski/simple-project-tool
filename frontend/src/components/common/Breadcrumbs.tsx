import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '../../hooks/useMediaQuery'

export interface Crumb {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
}

// Below md, beyond this many crumbs the middle of the trail is collapsed behind
// an ellipsis, because four crumbs already wrap on a phone. Collapsing takes the
// hidden crumbs out of the DOM (a screen reader should not read a trail the eye
// cannot see), which a CSS media query cannot do — so this is one of the few
// places where the viewport is read in JS rather than expressed as a variant.
// From md up the full trail always renders: dropping a link from the DOM at a
// width that has room for it costs a desktop reader a click to get it back.
const MAX_CRUMBS = 3

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const isMobile = useIsMobile()

  const collapsed = isMobile && !expanded && items.length > MAX_CRUMBS
  // first / … / parent / current
  const shown = collapsed ? [items[0], ...items.slice(-2)] : items
  const lastIndex = shown.length - 1

  return (
    <nav className="flex items-center gap-2 text-ui-sm text-stone-500">
      {shown.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 && <span>/</span>}
          {/* The current crumb is plain text even when it was given a target,
              matching the trails the detail pages already render. */}
          {index === lastIndex || !crumb.to ? (
            <span className="truncate">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.to}
              className="truncate hover:text-stone-800 dark:hover:text-stone-200"
            >
              {crumb.label}
            </Link>
          )}
          {collapsed && index === 0 && (
            <>
              <span>/</span>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={t('nav.show_all_crumbs')}
                className="px-1 rounded hover:text-stone-800 dark:hover:text-stone-200 focus-ring"
              >
                …
              </button>
            </>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
