import { useTranslation } from 'react-i18next'

const IMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 7h16M4 12h16M4 17h16"/>
  </svg>
)
const ISearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
  </svg>
)

interface Props {
  drawerOpen: boolean
  // The drawer's element id, so `aria-controls` resolves to the panel the
  // hamburger opens.
  drawerId: string
  onOpenDrawer: () => void
  onOpenSearch: () => void
}

// Replaces the 240px sidebar below `lg`, where it would eat two thirds of the
// screen: a hamburger for the navigation drawer and the search control that the
// ⌘K shortcut stands in for on desktop.
export function MobileTopBar({ drawerOpen, drawerId, onOpenDrawer, onOpenSearch }: Props) {
  const { t } = useTranslation()

  return (
    <header className="lg:hidden sticky top-0 z-30 h-topbar shrink-0 flex items-center justify-between gap-2 px-2 pt-[env(safe-area-inset-top)] border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={t('nav.open_menu')}
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900"
      >
        <IMenu />
      </button>
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label={t('shell.search')}
        className="inline-flex items-center justify-center w-10 h-10 rounded-md text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900"
      >
        <ISearch />
      </button>
    </header>
  )
}
