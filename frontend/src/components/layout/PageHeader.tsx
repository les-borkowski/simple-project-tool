import type { ReactNode } from 'react'

// The one padding recipe every page header uses, replacing the four combos the
// pages had drifted into (px-7 pt-6 pb-4, px-7 pt-5 pb-4, ...). It is a module
// constant rather than an inline string so the loading and loaded states share
// a byte-identical container className and the header never jumps.
const CONTAINER_CLASS =
  'sticky top-topbar lg:top-0 z-10 px-4 pt-4 pb-3 md:px-7 md:pt-5 md:pb-3 ' +
  'border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950'

// Shared by the loading and loaded branches so the placeholder sits in the same
// boxes, at the same type sizes, as the content it stands in for.
const ROW_CLASS = 'flex flex-wrap items-end justify-between gap-2'
const TITLE_CLASS = 'text-ui-3xl font-semibold tracking-tight break-words'
const SUBTITLE_CLASS = 'text-ui-md text-stone-500 mt-0.5'
const ACTIONS_CLASS = 'w-full md:w-auto'
// The row TaskDetailPage's status/priority/assignee cluster has always drawn
// below the title, reproduced verbatim so the migration is byte-identical.
const META_CLASS = 'flex items-center gap-2 mt-2 flex-wrap'
// The row the title shares with its adornment, reproducing the inline cluster
// ProjectDetailPage has always drawn beside the project name.
const TITLE_ROW_CLASS = 'flex items-center gap-3'
const PLACEHOLDER_CLASS = 'block rounded bg-stone-200 dark:bg-stone-700 animate-pulse'

// A placeholder filling the line box of the text it replaces: `h-[1.5em]` is the
// preflight line-height at whatever font size the surrounding element sets, so
// the line the skeleton reserves is the height the real line will take.
function SkeletonText({ width }: { width: string }) {
  return (
    <span className="flex items-center h-[1.5em]">
      <span className={`${PLACEHOLDER_CLASS} h-4 ${width}`} />
    </span>
  )
}

// The extra row only appears when there is something to put beside the
// heading, so the headers that pass no adornment render exactly the markup they
// rendered before the slot existed.
function TitleRow({ adornment, children }: { adornment?: ReactNode; children: ReactNode }) {
  if (!adornment) return children
  return (
    <div className={TITLE_ROW_CLASS}>
      {children}
      {adornment}
    </div>
  )
}

interface PageHeaderProps {
  title: ReactNode
  /**
   * Controls rendered beside the <h1>, in the same row. They deliberately do
   * not go through `title`: inside the heading they would be announced as part
   * of it ("Apollo To Do Medium") and bury interactive controls in an <h1>.
   */
  titleAdornment?: ReactNode
  /**
   * When present, takes the <h1>'s place entirely instead of nesting inside
   * it — for a click-to-edit title's <input>. A textbox nested inside a
   * heading takes over the heading's accessible name (the accname spec's
   * embedded-control rule uses the textbox's live value), so a naive
   * `title={<input />}` would still announce/query as the old heading text
   * the instant editing starts, and the only way to stop that without hiding
   * the input from assistive tech is to not have it be a descendant of the
   * <h1> at all.
   */
  titleEditor?: ReactNode
  /**
   * Click handler on the <h1> itself (ignored while `titleEditor` is
   * present, since there is no <h1> to click then). Exists for the same
   * reason as `titleEditor`: the handler has to be on the heading element a
   * user actually clicks, not on a child inside it.
   */
  onTitleClick?: () => void
  subtitle?: ReactNode
  /**
   * Controls rendered below the title (and below `subtitle`, when both are
   * present), in their own row. Kept out of `title` for the same reason as
   * `titleAdornment` — it holds interactive controls (buttons, selects) that
   * an <h1> must not swallow into its accessible name — and out of `subtitle`
   * because that renders a <p>, the wrong semantics and styling for controls.
   */
  meta?: ReactNode
  breadcrumbs?: ReactNode
  actions?: ReactNode
  loading?: boolean
}

export function PageHeader({
  title,
  titleAdornment,
  titleEditor,
  onTitleClick,
  subtitle,
  meta,
  breadcrumbs,
  actions,
  loading,
}: PageHeaderProps) {
  // The skeleton mirrors the shape it was handed — a crumb line only when there
  // are breadcrumbs, a subtitle line only when there is a subtitle, an actions
  // block only when there are actions — so flipping `loading` on one set of
  // props barely changes the header's height. The <h1> is kept (holding the
  // placeholder rather than text) so the page still has a level-1 heading while
  // it fetches, without a screen reader announcing a fake title.
  if (loading) {
    return (
      <div className={CONTAINER_CLASS}>
        {breadcrumbs && (
          // Breadcrumbs' own type size, so the reserved line box is the height
          // of the trail that will replace it.
          <div className="mb-2 text-ui-sm">
            <SkeletonText width="w-40" />
          </div>
        )}
        <div className={ROW_CLASS}>
          <div className="min-w-0">
            <TitleRow
              adornment={titleAdornment ? <span className={`${PLACEHOLDER_CLASS} h-5 w-16`} /> : null}
            >
              <h1 className={TITLE_CLASS}>
                <SkeletonText width="w-48" />
              </h1>
            </TitleRow>
            {subtitle && (
              <p className={SUBTITLE_CLASS}>
                <SkeletonText width="w-32" />
              </p>
            )}
            {meta && (
              <div className="mt-2">
                <span className={`${PLACEHOLDER_CLASS} h-6 w-40`} />
              </div>
            )}
          </div>
          {actions && (
            <div className={ACTIONS_CLASS}>
              <span className={`${PLACEHOLDER_CLASS} h-9 w-full md:w-28`} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={CONTAINER_CLASS}>
      {breadcrumbs && <div className="mb-2">{breadcrumbs}</div>}
      {/* One wrapping row: at 375px the actions cluster takes `w-full` and
          drops onto its own line instead of squeezing the title, which
          `min-w-0` then lets shrink rather than overflow. */}
      <div className={ROW_CLASS}>
        <div className="min-w-0">
          {/* Wraps rather than truncates: these titles interpolate user content
              (SearchResultsPage's query, a project name), and the pre-T09
              headers wrapped, so ellipsizing would both lose content and change
              desktop appearance. `min-w-0` on the parent plus `break-words`
              keeps an unbreakable string from overflowing the row. */}
          <TitleRow adornment={titleAdornment}>
            {titleEditor ?? (
              <h1
                className={onTitleClick ? `${TITLE_CLASS} cursor-text hover:text-stone-600 dark:hover:text-stone-300` : TITLE_CLASS}
                onClick={onTitleClick}
              >
                {title}
              </h1>
            )}
          </TitleRow>
          {subtitle && <p className={SUBTITLE_CLASS}>{subtitle}</p>}
          {meta && <div className={META_CLASS}>{meta}</div>}
        </div>
        {actions && <div className={ACTIONS_CLASS}>{actions}</div>}
      </div>
    </div>
  )
}
