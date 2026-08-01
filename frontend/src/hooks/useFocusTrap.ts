import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
].join(', ')

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return candidates.filter((element) => {
    if (element.hasAttribute('disabled')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    if (element.getAttribute('tabindex') === '-1') return false
    if (element.hidden) return false
    if (element.tagName === 'INPUT' && element.getAttribute('type') === 'hidden') return false
    if (element.getAttribute('aria-disabled') === 'true') return false
    return true
  })
}

type TabHandler = (event: KeyboardEvent) => void

// Only the topmost trap may handle Tab. A nested trap (a Modal inside a Modal)
// portals to document.body, so it is not a DOM descendant of the outer
// container: without this stack every outer trap would read a keystroke inside
// the inner dialog as "focus escaped" and yank focus back to its own first
// element, leaving the inner dialog's middle controls unreachable. Mirrors the
// topmost-only stack in useEscapeKey.
const trapStack: TabHandler[] = []
let listenerAttached = false

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const topmost = trapStack[trapStack.length - 1]
  topmost?.(event)
}

function ensureListenerAttached(): void {
  if (listenerAttached) return
  document.addEventListener('keydown', handleDocumentKeyDown)
  listenerAttached = true
}

function ensureListenerDetached(): void {
  if (!listenerAttached || trapStack.length > 0) return
  document.removeEventListener('keydown', handleDocumentKeyDown)
  listenerAttached = false
}

export function useFocusTrap(active: boolean): RefObject<HTMLElement | null> {
  const containerRef = useRef<HTMLElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const handleTab: TabHandler = (event) => {
      const container = containerRef.current
      if (!container) return

      const focusable = getFocusableElements(container)
      // A topmost trap with nothing to focus still owns Tab: returning here
      // would let focus walk out to the page behind, and no lower trap gets a
      // look either, since only the topmost handler runs.
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (event.shiftKey) {
        if (current === first || !container.contains(current)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (current === last || !container.contains(current)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    trapStack.push(handleTab)
    ensureListenerAttached()

    return () => {
      const index = trapStack.indexOf(handleTab)
      if (index !== -1) trapStack.splice(index, 1)
      ensureListenerDetached()
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
  }, [active])

  return containerRef
}
