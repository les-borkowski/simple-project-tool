import { useEffect, useState } from 'react'
import { NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { invitationsApi } from '../../services/api'

const ISearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
  </svg>
)
const IPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)
const IHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>
  </svg>
)
const IInbox = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M3 13h5l1 3h6l1-3h5"/><path d="M3 13l3-8h12l3 8v6H3z"/>
  </svg>
)
const ICog = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>
)
const ICaret = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

interface Props {
  children: React.ReactNode
}

export function AppShell({ children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const initials = user?.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    invitationsApi.mine().then((res) => {
      setPendingCount(res.data.filter(i => i.status === 'pending').length)
    }).catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 flex flex-col">
        {/* Workspace */}
        <div className="px-3 py-3 border-b border-stone-200 dark:border-stone-800">
          <Link to="/projects" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900">
            <span className="w-6 h-6 rounded-md accent-bg flex items-center justify-center text-[11px] font-semibold">SP</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold leading-tight">Simple Project Tool</span>
            </span>
          </Link>
        </div>

        {/* Search stub */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-800 text-stone-400 text-[12px]">
            <ISearch />
            <span className="flex-1 text-left">Search…</span>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="px-2 py-3 space-y-0.5 text-[13px]">
          <NavLink
            to="/projects"
            end
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md ${isActive ? 'bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900'}`
            }
          >
            <span className="text-stone-400"><IHome /></span>
            <span>Projects</span>
          </NavLink>
          <NavLink
            to="/invitations"
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md ${isActive ? 'bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900'}`
            }
          >
            <span className="text-stone-400"><IInbox /></span>
            <span className="flex-1">Invitations</span>
            {pendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-medium">{pendingCount}</span>
            )}
          </NavLink>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="border-t border-stone-200 dark:border-stone-800 p-2 space-y-0.5">
          <NavLink
            to="/config"
            className={({ isActive }) =>
              `w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] ${isActive ? 'bg-stone-100 dark:bg-stone-900' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900'}`
            }
          >
            <span className="text-stone-400"><ICog /></span>
            <span>Settings</span>
          </NavLink>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <span className="w-6 h-6 rounded-full av-2 inline-flex items-center justify-center text-white text-[9.5px] font-semibold">
                {initials}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-[12px] font-medium leading-tight truncate text-stone-800 dark:text-stone-100">{user?.name}</span>
                <span className="block text-[10.5px] text-stone-500 leading-tight capitalize">{user?.role}</span>
              </span>
              <span className="text-stone-400"><ICaret /></span>
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-lg z-50 overflow-hidden">
                <Link
                  to="/config"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <ICog /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800"
                >
                  <IPlus /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  )
}
