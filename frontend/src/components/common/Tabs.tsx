import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useIsDesktopShell } from '../../hooks/useMediaQuery'
import { tabId } from '../../utils/tabId'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

// `vertical-lg` is a horizontal pill scroller below lg and the desktop's
// vertical nav at lg+. The layout half of that switch is CSS variants only; the
// only thing that reads the viewport in JS is `aria-orientation`, because ARIA
// has no responsive form.
type Orientation = 'horizontal' | 'vertical-lg'

interface TabsProps {
  items: TabItem[]
  /** The active tab's key. Tabs is controlled; the caller renders the panel. */
  value: string
  onChange: (key: string) => void
  /** Accessible name of the tablist. */
  label: string
  orientation?: Orientation
  /** Id of the panel the selected tab controls. */
  panelId?: string
  /**
   * Namespace for the generated tab ids, so a caller that renders the panel can
   * name it with `tabId(idPrefix, key)`. Must be unique per tablist — it is
   * deliberately not derived from `panelId`, which two tablists may share.
   */
  idPrefix?: string
  className?: string
}

const LIST_CLASSES: Record<Orientation, string> = {
  horizontal: 'flex flex-row gap-1 overflow-x-auto',
  'vertical-lg':
    'flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-x-visible',
}

// shrink-0 + whitespace-nowrap are what keep the strip scrolling instead of
// squashing or wrapping its labels at 320px.
//
// The focus indicator is an *inset* outline rather than the shared `.focus-ring`
// box-shadow: the list is an `overflow-x-auto` scroller with no padding of its
// own, and overflow clips painting to the padding box, so anything drawn outside
// a tab's border box is clipped away (WCAG 2.4.7). Drawing it inside costs no
// layout, so the desktop nav's geometry is untouched.
const TAB_BASE =
  'shrink-0 whitespace-nowrap flex items-center gap-2.5 rounded-md transition-colors tap-safe ' +
  'focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--accent)]'

// Two visual recipes, selected by orientation: the pill row a horizontal
// tablist has always used, and the nav row/column of a `vertical-lg` one.
const TAB_CLASSES: Record<Orientation, string> = {
  horizontal: 'px-3 py-1.5 text-ui-md',
  'vertical-lg': 'px-2 py-1.5 text-ui-md lg:w-full',
}

const INACTIVE_CLASSES: Record<Orientation, string> = {
  horizontal: 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200',
  'vertical-lg':
    'text-stone-600 dark:text-stone-300 hover:bg-stone-100/60 dark:hover:bg-stone-900/60',
}

const ACTIVE_CLASSES = 'bg-stone-100 dark:bg-stone-900 font-medium text-stone-900 dark:text-stone-100'
const DISABLED_CLASSES = 'text-stone-400 dark:text-stone-600 cursor-not-allowed'

export function Tabs({
  items,
  value,
  onChange,
  label,
  orientation = 'horizontal',
  panelId,
  idPrefix,
  className = '',
}: TabsProps) {
  const generatedId = useId()
  const idBase = idPrefix ?? generatedId
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const isDesktopShell = useIsDesktopShell()

  // AC2: an off-screen tab has to come back into reach whenever it becomes the
  // active one, whether that was a click, an arrow key or the parent's doing.
  // `items` is a dependency too: reordering the strip or revealing a hidden tab
  // can push the active tab off-screen without `value` ever changing.
  // `nearest` on both axes so the strip scrolls without the page jumping.
  useEffect(() => {
    tabRefs.current.get(value)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value, items])

  // Disabled tabs are announced with aria-disabled rather than the native
  // attribute, so a screen reader still finds them — which means clicks and
  // arrow navigation have to refuse them explicitly.
  const activate = (index: number) => {
    const item = items[index]
    if (!item || item.disabled) return
    onChange(item.key)
    tabRefs.current.get(item.key)?.focus()
  }

  const activateFrom = (start: number, step: number) => {
    for (let offset = 1; offset <= items.length; offset++) {
      const index = (((start + step * offset) % items.length) + items.length) % items.length
      if (!items[index].disabled) {
        activate(index)
        return
      }
    }
  }

  // Roving tabindex needs exactly one tab stop, but `value` may name a disabled
  // tab or no tab at all (a stale key, or one hidden/reordered out of `items`).
  // Falling back to the first enabled tab keeps the tablist reachable by Tab;
  // selection still follows `value` alone, so no onChange is implied. With every
  // tab disabled there is nothing operable and the fallback is simply absent.
  const tabStop = items.find(({ key, disabled }) => key === value && !disabled)
  const tabStopKey = (tabStop ?? items.find(({ disabled }) => !disabled))?.key

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    // A vertical-lg tablist is a row on a phone and a column on the desktop
    // shell, so both axes stay operable at every width. A horizontal one
    // ignores the vertical arrows and leaves page scroll alone.
    const forwards = orientation === 'vertical-lg' ? ['ArrowRight', 'ArrowDown'] : ['ArrowRight']
    const backwards = orientation === 'vertical-lg' ? ['ArrowLeft', 'ArrowUp'] : ['ArrowLeft']

    if (forwards.includes(event.key)) {
      activateFrom(index, 1)
    } else if (backwards.includes(event.key)) {
      activateFrom(index, -1)
      // Home and End walk in from the ends, so they land on the first and last
      // *enabled* tab rather than on a disabled one.
    } else if (event.key === 'Home') {
      activateFrom(items.length - 1, 1)
    } else if (event.key === 'End') {
      activateFrom(0, -1)
    } else {
      return
    }
    event.preventDefault()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={
        orientation === 'vertical-lg' && isDesktopShell ? 'vertical' : 'horizontal'
      }
      className={`${LIST_CLASSES[orientation]} ${className}`.trim()}
    >
      {items.map(({ key, label: itemLabel, icon, disabled }, index) => (
        <button
          key={key}
          ref={(node) => {
            if (node) {
              tabRefs.current.set(key, node)
            } else {
              tabRefs.current.delete(key)
            }
          }}
          type="button"
          role="tab"
          id={tabId(idBase, key)}
          aria-selected={key === value}
          aria-controls={key === value ? panelId : undefined}
          aria-disabled={disabled || undefined}
          // Roving tabindex: the tablist is one tab stop, entered on the
          // active tab and left again on the next Tab press.
          tabIndex={key === tabStopKey ? 0 : -1}
          onClick={() => activate(index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`${TAB_BASE} ${TAB_CLASSES[orientation]} ${
            disabled
              ? DISABLED_CLASSES
              : key === value
                ? ACTIVE_CLASSES
                : INACTIVE_CLASSES[orientation]
          }`}
        >
          {icon && (
            <span className={disabled ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'}>
              {icon}
            </span>
          )}
          {itemLabel}
        </button>
      ))}
    </div>
  )
}
