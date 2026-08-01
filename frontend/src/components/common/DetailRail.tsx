import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useIsDesktopShell } from '../../hooks/useMediaQuery'

// The rail as the detail pages have always drawn it, with the one border change
// the stacked mobile layout needs: the rule runs along the bottom below lg, and
// returns to the left-hand edge at lg so the desktop rail is unchanged.
//
// The rail is rendered FIRST in the grid, before the main column. Below lg no
// `order` is set, so the DOM order a screen reader traverses is the visual
// order — rail on top. At lg `order-last` (order: 9999) beats the main column's
// default `order: 0` on its own, so the rail sits right without the adopting
// page having to put a matching class on its content column.
const RAIL_CLASS =
  'lg:order-last border-b lg:border-b-0 lg:border-l ' +
  'border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/30 ' +
  'px-5 py-5 space-y-5 text-ui-md'

// Two across on a phone, one per line at lg — where `lg:gap-5` reproduces the
// `space-y-5` the fields used to get from the rail itself.
const FIELDS_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1 lg:gap-5'

// The rail's section label, shared by the desktop heading and the mobile toggle
// so a section reads the same at every width.
const SECTION_LABEL_CLASS = 'text-ui-xs uppercase tracking-wider text-stone-400 font-medium'

const IChevron = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
    className={expanded ? 'rotate-180' : ''}
  >
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

function DisclosureToggle({
  label,
  panelId,
  expanded,
  onToggle,
}: {
  label: string
  panelId: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      className={`${SECTION_LABEL_CLASS} flex w-full items-center justify-between gap-2 py-1 rounded focus-ring tap-safe`}
    >
      {label}
      <IChevron expanded={expanded} />
    </button>
  )
}

// The panel is always in the DOM so the toggle's `aria-controls` always resolves,
// but its content is unmounted while collapsed — a collapsed section must leave
// the accessibility tree, not merely be painted out of sight.
function DisclosurePanel({
  id,
  open,
  className,
  children,
}: {
  id: string
  open: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div id={id} hidden={!open} className={className}>
      {open ? children : null}
    </div>
  )
}

interface DetailRailProps {
  /** Accessible name of the rail landmark, and the label of its mobile disclosure. */
  label: string
  /** The `DetailField` rows. */
  children: ReactNode
  /** A second section — the status history — collapsed by default below lg. */
  secondary?: { label: string; children: ReactNode }
}

export function DetailRail({ label, children, secondary }: DetailRailProps) {
  // The only thing here allowed to read the viewport in JS: whether a section
  // *can* be collapsed at all is behaviour, and no CSS variant can take a
  // collapsed panel out of the accessibility tree. The border side, the source
  // order and the column count are layout, and stay pure CSS variants.
  const isDesktop = useIsDesktopShell()
  const fieldsId = useId()
  const secondaryId = useId()
  const [fieldsOpen, setFieldsOpen] = useState(true)
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  const fieldsVisible = isDesktop || fieldsOpen
  const secondaryVisible = isDesktop || secondaryOpen

  return (
    <aside aria-label={label} className={RAIL_CLASS}>
      <div>
        {!isDesktop && (
          <DisclosureToggle
            label={label}
            panelId={fieldsId}
            expanded={fieldsOpen}
            onToggle={() => setFieldsOpen((open) => !open)}
          />
        )}
        <DisclosurePanel id={fieldsId} open={fieldsVisible} className={FIELDS_CLASS}>
          {children}
        </DisclosurePanel>
      </div>

      {secondary && (
        <div>
          {isDesktop ? (
            <div className={`${SECTION_LABEL_CLASS} mb-2`}>{secondary.label}</div>
          ) : (
            <DisclosureToggle
              label={secondary.label}
              panelId={secondaryId}
              expanded={secondaryOpen}
              onToggle={() => setSecondaryOpen((open) => !open)}
            />
          )}
          <DisclosurePanel id={secondaryId} open={secondaryVisible}>
            {secondary.children}
          </DisclosurePanel>
        </div>
      )}
    </aside>
  )
}
