import { useEffect, useRef } from 'react'

type Handler = () => void

const handlerStack: Handler[] = []
let listenerAttached = false

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const topmost = handlerStack[handlerStack.length - 1]
  topmost?.()
}

function ensureListenerAttached(): void {
  if (listenerAttached) return
  document.addEventListener('keydown', handleDocumentKeyDown)
  listenerAttached = true
}

function ensureListenerDetached(): void {
  if (!listenerAttached || handlerStack.length > 0) return
  document.removeEventListener('keydown', handleDocumentKeyDown)
  listenerAttached = false
}

export function useEscapeKey(active: boolean, handler: () => void): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!active) return

    const stableHandler: Handler = () => handlerRef.current()
    handlerStack.push(stableHandler)
    ensureListenerAttached()

    return () => {
      const index = handlerStack.indexOf(stableHandler)
      if (index !== -1) handlerStack.splice(index, 1)
      ensureListenerDetached()
    }
  }, [active])
}
