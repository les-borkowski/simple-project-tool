import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// Keeps the popover's viewport-relative edges at least this many pixels
// inside the viewport when clamping it back on screen (finding 3, T07 review).
const VIEWPORT_MARGIN = 8

// Gap between the trigger and the panel, matching the `mt-1` this replaces.
const TRIGGER_GAP = 4

interface MenuContextValue {
  close: (options?: { restoreFocus?: boolean }) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

interface MenuProps {
  trigger: ReactElement
  children: ReactNode
}

interface TriggerProps {
  onClick?: () => void
  ref?: Ref<HTMLElement>
}

// Applies a node to a ref, whatever shape that ref takes (callback or object).
// Only ever called from an effect, never during render.
function applyRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') {
    ref(node)
  } else if (ref && typeof ref === 'object') {
    ;(ref as { current: T | null }).current = node
  }
}

interface PanelPosition {
  top: number
  left: number
}

// Computes the panel's fixed-position coordinates from the trigger's and
// panel's own measured boxes (both viewport-relative, from
// getBoundingClientRect — so this works regardless of which ancestor
// scrolls). Anchors the panel to the trigger's right edge, directly below
// it, then clamps it back inside the viewport (finding 3, T07 review) and
// flips it above the trigger if there isn't room below.
function computePanelPosition(triggerRect: DOMRect, panelWidth: number, panelHeight: number): PanelPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let top = triggerRect.bottom + TRIGGER_GAP
  if (top + panelHeight > viewportHeight - VIEWPORT_MARGIN) {
    top = triggerRect.top - TRIGGER_GAP - panelHeight
  }

  let left = triggerRect.right - panelWidth
  const maxLeft = viewportWidth - VIEWPORT_MARGIN - panelWidth
  if (left > maxLeft) {
    left = maxLeft
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN
  }

  return { top, left }
}

export function Menu({ trigger, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null)

  const close = ({ restoreFocus = false }: { restoreFocus?: boolean } = {}) => {
    setOpen(false)
    // Only pull focus back to the trigger for closes the keyboard user
    // initiated (Escape, item selection). Outside clicks leave focus wherever
    // the user actually clicked instead of yanking it back to the trigger.
    if (restoreFocus) {
      triggerRef.current?.focus()
    }
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!(e.target instanceof Node)) return
      // The panel is portalled to document.body, so it is no longer a DOM
      // descendant of containerRef — check it separately, otherwise every
      // click on a menu item would be treated as an outside click.
      const insideContainer = containerRef.current?.contains(e.target)
      const insidePanel = panelRef.current?.contains(e.target)
      if (!insideContainer && !insidePanel) {
        close()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  useEscapeKey(open, () => close({ restoreFocus: true }))

  // Once the panel is portalled to document.body it sits at the very end of
  // the DOM, no longer directly after the trigger — so natural Tab order
  // would skip straight past it to whatever follows the trigger in the page.
  // Restore the pre-portal tab flow explicitly: Tab from the trigger enters
  // the panel's first item, and Shift+Tab from that first item returns to
  // the trigger.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      const trigger = triggerRef.current
      if (!panel || !trigger) return
      const focusable = panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
      const first = focusable[0]
      if (!first) return
      if (!e.shiftKey && document.activeElement === trigger) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        trigger.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // The panel is portalled to document.body and positioned `fixed` from the
  // trigger's measured box (finding 3, T07 review): the previous approach
  // anchored it with CSS relative to the trigger (`right-0 top-full`) and
  // only nudged it with a transform when it escaped the *viewport*. That
  // missed the real clipping ancestor on the board — a horizontally
  // scrolling column container — because an absolutely-positioned descendant
  // of an `overflow: auto` ancestor is clipped by it no matter how it's
  // translated. Escaping via a portal is the only fix; `fixed` coordinates
  // are then plain viewport coordinates, so the existing clamping math
  // works correctly.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return

    function reposition() {
      if (!trigger || !panel) return
      const triggerRect = trigger.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      setPanelPosition(computePanelPosition(triggerRect, panelRect.width, panelRect.height))
    }

    reposition()
    // The board scrolls horizontally inside a container that isn't the
    // document, so listen in the capture phase to catch scrolls of any
    // ancestor, not just window/document scroll.
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const triggerHasRef = isValidElement<TriggerProps>(trigger)
  const originalTriggerRef = triggerHasRef ? trigger.props.ref : undefined

  // Forward the trigger DOM node to whatever ref the caller already attached
  // to it, so Menu doesn't clobber a ref the caller relies on. Refs must
  // only be read/written outside of render, hence the effect.
  useEffect(() => {
    applyRef(originalTriggerRef, triggerRef.current)
    return () => applyRef(originalTriggerRef, null)
  }, [originalTriggerRef])

  const triggerElement = triggerHasRef
    ? // cloneElement's ref is a plain DOM ref attached at commit time by
      // React, not read during this render; the linter can't see through
      // cloneElement to know that.
      // eslint-disable-next-line react-hooks/refs
      cloneElement(trigger, {
        ref: triggerRef,
        onClick: () => {
          trigger.props.onClick?.()
          setOpen(v => !v)
        },
        'aria-haspopup': 'true',
        'aria-expanded': open,
      } as Partial<TriggerProps> & Record<string, unknown>)
    : trigger

  // Kept invisible until the first position is measured so the panel never
  // flashes at its default (unpositioned) spot before the layout effect
  // above runs. In jsdom, where getBoundingClientRect is all-zero, this
  // still resolves to a stable (if meaningless) position — no NaNs.
  const panelStyle: CSSProperties = panelPosition
    ? { position: 'fixed', top: panelPosition.top, left: panelPosition.left }
    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }

  return (
    <div className="relative" ref={containerRef}>
      {triggerElement}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-lg z-50 min-w-[140px]"
          >
            <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
          </div>,
          document.body,
        )}
    </div>
  )
}

interface MenuItemProps {
  onSelect: () => void
  destructive?: boolean
  children: ReactNode
}

export function MenuItem({ onSelect, destructive, children }: MenuItemProps) {
  const menu = useContext(MenuContext)

  function handleClick() {
    onSelect()
    menu?.close({ restoreFocus: true })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-ui-md hover:bg-stone-50 dark:hover:bg-stone-800 ${
        destructive ? 'text-rose-600' : 'text-stone-700 dark:text-stone-300'
      }`}
    >
      {children}
    </button>
  )
}
