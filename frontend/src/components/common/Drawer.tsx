import { useEffect, useId } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { getFocusableElements, useFocusTrap } from '../../hooks/useFocusTrap'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  // Applied to the dialog element so the control that opens the drawer can
  // point an `aria-controls` at it; an id generated inside here could not be
  // read by that trigger.
  id?: string
  children: ReactNode
}

// Modal's left-anchored sibling: same portal, same backdrop guard, same
// focus/Escape/scroll-lock hooks, but a full-height sheet against the left edge
// instead of a centred panel.
export function Drawer({ open, onClose, title, id, children }: DrawerProps) {
  const titleId = useId()

  const panelRef = useFocusTrap(open)
  useBodyScrollLock(open)
  useEscapeKey(open, onClose)

  // Focus has to start inside the sheet, otherwise the first Tab lands on
  // whatever follows the portal container at the end of <body>.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const [first] = getFocusableElements(panel)
    ;(first ?? panel).focus()
  }, [open, panelRef])

  // Unmounted rather than translated off-screen, so a closed drawer puts no
  // second copy of its contents in the tab order.
  if (!open) return null

  return createPortal(
    <div
      // Keyed off mousedown, and off the event target rather than the bubble, so
      // a drag that starts on a nav item and overshoots onto the backdrop does
      // not dismiss.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex justify-start bg-black/40"
    >
      <div
        ref={panelRef as RefObject<HTMLDivElement | null>}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Like Modal's panel, the sheet reaches the bottom edge, so its last
        // control needs clearing of the home indicator's gesture strip.
        className="flex flex-col h-dvh w-[280px] max-w-[85vw] bg-white dark:bg-stone-950 shadow-xl pb-[env(safe-area-inset-bottom)]"
      >
        {/* The sheet's own contents carry the visible branding, so the
            accessible name is provided off-screen rather than as a heading the
            design does not have room for. */}
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
