import { useEffect } from 'react'

let lockCount = 0
let originalOverflow = ''
let originalPaddingRight = ''

function lock(): void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow
    originalPaddingRight = document.body.style.paddingRight

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      const currentPaddingRight = parseFloat(
        window.getComputedStyle(document.body).paddingRight || '0',
      )
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`
    }
  }
  lockCount += 1
}

function unlock(): void {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow
    document.body.style.paddingRight = originalPaddingRight
  }
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return

    lock()
    return () => {
      unlock()
    }
  }, [active])
}
