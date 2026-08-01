import { Children, useEffect, useId } from 'react'
import type { FormEventHandler, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { getFocusableElements, useFocusTrap } from '../../hooks/useFocusTrap'

// Width caps replacing the old `w-[min(90vw,_900px)] min-w-[67vw]` recipe. The
// minimum width is deliberately gone rather than made responsive: on a phone it
// forced the panel wider than the sheet needs to be.
const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  size?: 'sm' | 'md' | 'lg'
  footer?: ReactNode
  // When given, the panel's contents are wrapped in a <form>, so a footer
  // submit button sits inside the same form as the fields and Enter in a text
  // field submits — without every call site threading an id + form="…" pair.
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  footer,
  onSubmit,
  children,
}: ModalProps) {
  const titleId = useId()

  // Restores focus to whatever opened the modal when it deactivates, and keeps
  // Tab from reaching the page behind the backdrop.
  const panelRef = useFocusTrap(open)
  // Ref-counted, so a nested modal keeps the body locked until the last one closes.
  useBodyScrollLock(open)
  useEscapeKey(open, onClose)

  // Focus has to start inside the dialog, otherwise the first Tab lands on
  // whatever follows the portal container at the end of <body>. Shares the
  // trap's definition of "focusable" so a leading `<button disabled>` or
  // `<input type="hidden">` cannot swallow the focus call.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const [first] = getFocusableElements(panel)
    ;(first ?? panel).focus()
  }, [open, panelRef])

  if (!open) return null

  // Not a plain `children &&` truthiness check: a body written as
  // `{a && <p/>}{b && <p/>}` arrives as the array [false, false], which is
  // truthy and would render an empty band. Children.toArray drops null,
  // undefined and booleans while keeping a lone `0`, which is real content.
  const hasBody = Children.toArray(children).length > 0

  const content = (
    <>
      <div className="shrink-0 px-6 pt-6 pb-2">
        <h2 id={titleId} className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          {title}
        </h2>
      </div>
      {/* Omitted entirely when there is no body, so a description-less
          ConfirmDialog keeps its original 8px title-to-buttons gap instead of
          gaining an empty 24px band. The bottom padding is the gap to the
          footer (16px, matching the old `mb-4`) and falls back to the panel's
          own 24px inset when the modal has no footer. */}
      {hasBody && (
        <div className={`overflow-y-auto px-6 ${footer ? 'pb-4' : 'pb-6'}`}>{children}</div>
      )}
      {footer && <div className="shrink-0 px-6 pb-6">{footer}</div>}
    </>
  )

  // Portalled to document.body so no scrolling or overflow-hidden ancestor can
  // clip the panel (the lesson T07 learnt with Menu).
  return createPortal(
    <div
      // A phone has no Escape key, so the backdrop is the only way out for
      // modals without a cancel action. Keyed off mousedown, and off the event
      // target rather than the bubble, so a selection drag that starts in the
      // panel and overshoots onto the backdrop does not dismiss.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
    >
      <div
        ref={panelRef as RefObject<HTMLDivElement | null>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex flex-col w-full ${SIZE_CLASSES[size]} max-h-[85dvh] bg-white dark:bg-stone-800 shadow-xl rounded-t-2xl md:rounded-lg pb-[env(safe-area-inset-bottom)] md:pb-0 md:mx-4`}
      >
        {onSubmit ? (
          // min-h-0 so the form does not defeat the panel's max-height and the
          // body keeps scrolling instead of overflowing.
          <form onSubmit={onSubmit} className="flex flex-col min-h-0">
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>,
    document.body,
  )
}
