import { useCallback, useEffect, useId, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useIsDesktopShell } from '../../hooks/useMediaQuery'
import { invitationsApi, projectsApi, recentApi } from '../../services/api'
import type { ProjectResponse, RecentItemResponse } from '../../services/api'
import { Drawer } from '../common/Drawer'
import { CommandPalette } from './CommandPalette'
import { MobileTopBar } from './MobileTopBar'
import { SidebarNav } from './SidebarNav'
import { initials as getInitials } from '../../utils/initials'

interface Props {
  children: React.ReactNode
}

export function AppShell({ children }: Props) {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [pendingCount, setPendingCount] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerId = useId()
  // Whether the drawer exists at all is behaviour, not layout: no CSS variant
  // can release a scroll lock or a focus trap. Same call as DetailRail's.
  const isDesktop = useIsDesktopShell()
  // A rotation from portrait to landscape crosses `lg` with the drawer still
  // open, and the sheet would otherwise cover the desktop sidebar that replaced
  // it — with the hamburger that dismisses it now display:none.
  const drawerVisible = drawerOpen && !isDesktop

  // The palette does not portal, so it and the drawer are two z-50 overlays in
  // one stacking context: leaving the drawer open buries the palette under it,
  // hands the drawer the topmost focus trap and puts drawer links under every
  // tap aimed at a palette row.
  const openPalette = useCallback(() => {
    setDrawerOpen(false)
    setPaletteOpen(true)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // Modal and Drawer both createPortal to document.body; CommandPalette
        // renders in-place inside #root (T12/T18, deliberately not portalled).
        // All three declare role="dialog" aria-modal="true" and z-index:50 in
        // one stacking context, so DOM order decides and a portalled overlay
        // always wins visually — but ⌘K would still mount the palette
        // underneath it, stealing focus, the topmost Tab trap and the topmost
        // Escape handler. Guard against any *other* open dialog, but exclude
        // the drawer (id === drawerId): T12 relies on ⌘K working from inside
        // the drawer to close it and open the palette in its place.
        const blockingDialog = Array.from(
          document.querySelectorAll('[role="dialog"][aria-modal="true"]')
        ).some((el) => el.id !== drawerId)
        if (blockingDialog) return
        e.preventDefault()
        openPalette()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openPalette, drawerId])
  const [recentProjects, setRecentProjects] = useState<ProjectResponse[]>([])
  const [hasMoreProjects, setHasMoreProjects] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItemResponse[]>([])
  const initials = user ? getInitials(user.name) : '?'

  useEffect(() => {
    if (!isAuthenticated) return

    invitationsApi.mine().then((res) => {
      setPendingCount(res.data.filter(i => i.status === 'pending').length)
    }).catch(() => {})

    projectsApi.list({ limit: 6 }).then((res) => {
      const items = res.data.items
      const hasMore = items.length === 6
      setHasMoreProjects(hasMore)
      setRecentProjects(items.slice(0, hasMore ? 4 : 5))
    }).catch(() => {})

    recentApi.list().then((res) => {
      setRecentItems(res.data.slice(0, 5))
    }).catch(() => {})
  }, [isAuthenticated])

  // Navigations that do not come from a drawer link — a breadcrumb, a redirect,
  // the browser's back button — must close the drawer too. Adjusted during
  // render rather than in an effect, so the drawer never paints over the page
  // it has already navigated away from.
  const [pathAtLastRender, setPathAtLastRender] = useState(location.pathname)
  if (pathAtLastRender !== location.pathname) {
    setPathAtLastRender(location.pathname)
    setDrawerOpen(false)
  }

  const handleLogout = () => {
    setDrawerOpen(false)
    logout()
    navigate('/login')
  }

  const projectsActive = location.pathname === '/projects'

  const nav = (onNavigate: () => void) => (
    <SidebarNav
      recentItems={recentItems}
      recentProjects={recentProjects}
      hasMoreProjects={hasMoreProjects}
      pendingCount={pendingCount}
      projectsActive={projectsActive}
      user={user}
      initials={initials}
      onSearch={openPalette}
      onLogout={handleLogout}
      onNavigate={onNavigate}
    />
  )

  return (
    <div className="flex flex-col lg:flex-row min-h-dvh bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <MobileTopBar
        drawerOpen={drawerVisible}
        drawerId={drawerId}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSearch={openPalette}
      />

      {/* Sidebar — the phone gets the same navigation through the drawer below */}
      <aside className="w-[240px] shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 hidden lg:flex flex-col h-dvh sticky top-0">
        {nav(() => {})}
      </aside>

      <Drawer
        open={drawerVisible}
        onClose={() => setDrawerOpen(false)}
        title={t('nav.menu')}
        id={drawerId}
      >
        {/* Tapping the link for the route you are already on leaves the path
            untouched, so the route effect above never fires: the drawer has to
            close from the click as well. */}
        {nav(() => setDrawerOpen(false))}
      </Drawer>

      {/* Main content */}
      {/* The floor is scoped to `lg`, where the root is a row and it overlaps
          the root's own: below it the root is a column, so a bare `min-h-dvh`
          here would stack under the top bar and beat flex-grow. */}
      <main className="flex-1 min-w-0 flex flex-col lg:min-h-dvh">
        {children}
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
