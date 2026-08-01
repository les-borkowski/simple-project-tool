import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { searchApi, configApi } from '../../services/api'
import type { RecentItemResponse } from '../../services/api'
import { applyTheme, getCurrentTheme } from '../../utils/theme'
import { recentLink } from '../../utils/links'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { useFocusTrap } from '../../hooks/useFocusTrap'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const ISearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
  </svg>
)
const IPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14"/>
  </svg>
)
const IFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
)
const IDoc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6M8 13h8M8 17h5"/>
  </svg>
)
const ICheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
)
const ICog = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>
)
const IUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)
const IMoon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const ISun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeLabel(type: RecentItemResponse['type']): string {
  if (type === 'project') return 'Project'
  if (type === 'story') return 'Story'
  return 'Task'
}

function typeIcon(type: RecentItemResponse['type']) {
  if (type === 'project') return <IFolder />
  if (type === 'story') return <IDoc />
  return <ICheck />
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface Action {
  id: string
  label: string
  icon: React.ReactNode
  onClick: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecentItemResponse[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // Escape is two-stage: clear the query first, then close on a second press
  // with an empty query. The shared stack only owns "what happens on
  // Escape" — this closure still decides which stage applies.
  useEscapeKey(open, () => {
    if (query) {
      setQuery('')
    } else {
      onClose()
    }
  })
  useBodyScrollLock(open)
  const panelRef = useFocusTrap(open)

  // Parse context from URL
  const pathParts = location.pathname.split('/')
  const projectsIdx = pathParts.indexOf('projects')
  const projectId = projectsIdx !== -1 ? pathParts[projectsIdx + 1] : undefined

  // Focus input when palette opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setFocusedIndex(-1)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!query) {
      setResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const timer = setTimeout(() => {
      searchApi.search(query)
        .then((res) => {
          setResults(res.data)
        })
        .catch(() => {
          setResults([])
        })
        .finally(() => {
          setIsSearching(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Reset focused index when list content changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [query, results.length])

  if (!open) return null

  // Build quick actions
  const quickActions: Action[] = []

  if (location.pathname === '/projects') {
    quickActions.push({
      id: 'new-project',
      label: t('palette.new_project'),
      icon: <IPlus />,
      onClick: () => { navigate('/projects', { state: { modal: 'create-project' } }); onClose() },
    })
  }

  if (projectId) {
    quickActions.push({
      id: 'new-story',
      label: t('palette.new_story'),
      icon: <IDoc />,
      onClick: () => { navigate(`/projects/${projectId}`, { state: { modal: 'create-story' } }); onClose() },
    })
    quickActions.push({
      id: 'new-task',
      label: t('palette.new_task'),
      icon: <ICheck />,
      onClick: () => { navigate(`/projects/${projectId}`, { state: { modal: 'create-task' } }); onClose() },
    })
    quickActions.push({
      id: 'invite-member',
      label: t('palette.invite_member'),
      icon: <IUser />,
      onClick: () => { navigate(`/projects/${projectId}?tab=members`); onClose() },
    })
  }

  quickActions.push({
    id: 'open-settings',
    label: t('palette.open_settings'),
    icon: <ICog />,
    onClick: () => { navigate('/config'); onClose() },
  })

  const currentTheme = getCurrentTheme()
  quickActions.push({
    id: 'toggle-theme',
    label: currentTheme === 'dark' ? t('palette.toggle_light') : t('palette.toggle_dark'),
    icon: currentTheme === 'dark' ? <ISun /> : <IMoon />,
    onClick: () => {
      const prev = getCurrentTheme()
      const next = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      configApi.update({ theme: next }).catch(() => {
        applyTheme(prev)
      })
      onClose()
    },
  })

  // Build displayed result rows (capped at 5)
  const displayedResults = results.slice(0, 5)
  const hasMore = results.length > 5

  // Unified list for keyboard navigation
  const activeList: Array<() => void> = query === ''
    ? quickActions.map((a) => a.onClick)
    : [
        ...displayedResults.map((item) => () => { navigate(recentLink(item)); onClose() }),
        ...(hasMore ? [() => { navigate('/search?q=' + encodeURIComponent(query)); onClose() }] : []),
      ]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, activeList.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < activeList.length) {
        activeList[focusedIndex]()
      }
    }
  }

  const ROW = 'flex items-center gap-3 px-4 py-2.5 cursor-pointer rounded-lg'
  const ROW_NORMAL = `${ROW} hover:bg-stone-50 dark:hover:bg-stone-800`
  const ROW_FOCUSED = `${ROW} bg-stone-100 dark:bg-stone-800`

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] md:pt-[20vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef as RefObject<HTMLDivElement | null>}
        className="max-w-xl w-full mx-4 max-h-[80dvh] flex flex-col bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >

        {/* Search input row */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3">
          <span className="text-stone-400 shrink-0"><ISearch /></span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-ui-lg text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-ui-xl leading-none shrink-0"
              aria-label="Clear"
            >
              ×
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="shrink-0 border-t border-stone-100 dark:border-stone-800" />

        {/* List */}
        <div className="py-1.5 min-h-0 overflow-y-auto" role="listbox">

          {/* Quick actions (empty query) */}
          {query === '' && (
            <>
              <div className="px-4 py-1.5 text-ui-2xs uppercase tracking-wider font-medium text-stone-400 dark:text-stone-500 select-none">
                {t('palette.quick_actions')}
              </div>
              {quickActions.map((action, idx) => (
                <div
                  key={action.id}
                  role="option"
                  aria-selected={focusedIndex === idx}
                  className={focusedIndex === idx ? ROW_FOCUSED : ROW_NORMAL}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onMouseLeave={() => setFocusedIndex(-1)}
                  onMouseDown={() => action.onClick()}
                >
                  <span className="text-stone-400 shrink-0">{action.icon}</span>
                  <span className="text-ui-lg text-stone-700 dark:text-stone-200">{action.label}</span>
                </div>
              ))}
            </>
          )}

          {/* Search results */}
          {query !== '' && isSearching && (
            <div className="px-4 py-3 text-ui-md text-stone-400 italic">{t('search.searching')}</div>
          )}

          {query !== '' && !isSearching && results.length === 0 && (
            <div className="px-4 py-4 text-ui-md italic text-stone-400 dark:text-stone-500">
              {t('search.empty', { q: query })}
            </div>
          )}

          {query !== '' && displayedResults.map((item, idx) => (
            <div
              key={`${item.type}-${item.id}`}
              role="option"
              aria-selected={focusedIndex === idx}
              className={focusedIndex === idx ? ROW_FOCUSED : ROW_NORMAL}
              onMouseEnter={() => setFocusedIndex(idx)}
              onMouseLeave={() => setFocusedIndex(-1)}
              onMouseDown={() => { navigate(recentLink(item)); onClose() }}
            >
              <span className="text-stone-400 shrink-0">{typeIcon(item.type)}</span>
              <span className="flex-1 min-w-0 text-ui-lg text-stone-800 dark:text-stone-200 truncate">{item.title}</span>
              <span className="text-ui-sm text-stone-400 dark:text-stone-500 shrink-0">{typeLabel(item.type)}</span>
            </div>
          ))}

          {query !== '' && hasMore && (
            <div
              role="option"
              aria-selected={focusedIndex === displayedResults.length}
              className={focusedIndex === displayedResults.length ? ROW_FOCUSED : ROW_NORMAL}
              onMouseEnter={() => setFocusedIndex(displayedResults.length)}
              onMouseLeave={() => setFocusedIndex(-1)}
              onMouseDown={() => { navigate('/search?q=' + encodeURIComponent(query)); onClose() }}
            >
              <span className="w-[14px] shrink-0" />
              <span className="text-ui-md text-stone-500 dark:text-stone-400">
                {t('palette.see_all', { count: results.length })}
              </span>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
