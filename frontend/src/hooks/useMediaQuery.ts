import { useSyncExternalStore } from 'react'

function getServerSnapshot() {
  return false
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(query)
      const listener = () => onStoreChange()

      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', listener)
        return () => mql.removeEventListener('change', listener)
      }

      mql.addListener(listener)
      return () => mql.removeListener(listener)
    },
    () => window.matchMedia(query).matches,
    getServerSnapshot,
  )
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}

export function useIsDesktopShell(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
