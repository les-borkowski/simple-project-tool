import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import i18n from '../i18n'

// Recent Node versions ship their own global `localStorage` (an accessor
// property backed by a file) which wins over jsdom's implementation — by the
// time this file runs, `window === globalThis` already points at the broken
// native storage, so there is no working Storage to borrow from. Replace the
// property outright with a minimal in-memory Storage implementation, which is
// all AuthContext / ThemeContext's `getItem`/`setItem`/`removeItem` need.
function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  } as Storage
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
})

// ---------------------------------------------------------------------------
// matchMedia stub
// ---------------------------------------------------------------------------
// jsdom does not implement matchMedia at all. AuthContext.tsx and utils/theme.ts
// both call window.matchMedia('(prefers-color-scheme: dark)') during render, so
// every test that mounts through AuthProvider (or calls applyTheme) crashes
// without this. Also exposes setViewportWidth() so tests can drive layout
// breakpoints deterministically.

type Listener = (event: MediaQueryListEvent) => void

interface TrackedMql {
  mql: MediaQueryList
  query: string
  listeners: Set<Listener>
}

type PointerType = 'fine' | 'coarse'

let currentWidth = 1280
let currentPointerType: PointerType = 'fine'
let tracked: TrackedMql[] = []

function parseWidthQuery(query: string): { kind: 'max' | 'min'; px: number } | null {
  const maxMatch = query.match(/\(max-width:\s*([0-9.]+)px\)/)
  if (maxMatch) return { kind: 'max', px: parseFloat(maxMatch[1]) }
  const minMatch = query.match(/\(min-width:\s*([0-9.]+)px\)/)
  if (minMatch) return { kind: 'min', px: parseFloat(minMatch[1]) }
  return null
}

function computeMatches(query: string): boolean {
  const parsed = parseWidthQuery(query)
  if (parsed) {
    return parsed.kind === 'max' ? currentWidth <= parsed.px : currentWidth >= parsed.px
  }

  const pointerMatch = query.match(/\(pointer:\s*(fine|coarse)\)/)
  if (pointerMatch) {
    return pointerMatch[1] === currentPointerType
  }

  const hoverMatch = query.match(/\(hover:\s*(hover|none)\)/)
  if (hoverMatch) {
    const hoverCapable = currentPointerType === 'fine'
    return hoverMatch[1] === (hoverCapable ? 'hover' : 'none')
  }

  // Any other query (prefers-color-scheme, etc.) defaults to false and must
  // never throw.
  return false
}

function createMatchMedia(query: string): MediaQueryList {
  const entry: TrackedMql = { mql: null as unknown as MediaQueryList, query, listeners: new Set() }

  const mql = {
    get matches() {
      return computeMatches(query)
    },
    media: query,
    onchange: null,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change') return
      entry.listeners.add(listener as Listener)
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'change') return
      entry.listeners.delete(listener as Listener)
    },
    addListener: (listener: Listener) => {
      entry.listeners.add(listener)
    },
    removeListener: (listener: Listener) => {
      entry.listeners.delete(listener)
    },
    dispatchEvent: () => true,
  } as unknown as MediaQueryList

  entry.mql = mql
  tracked.push(entry)
  return mql
}

window.matchMedia = ((query: string) => createMatchMedia(query)) as typeof window.matchMedia

export function setViewportWidth(px: number): void {
  currentWidth = px
  notifyListeners()
}

export function setPointerType(type: PointerType): void {
  currentPointerType = type
  notifyListeners()
}

function notifyListeners(): void {
  for (const entry of tracked) {
    const matches = computeMatches(entry.query)
    const event = { matches, media: entry.query } as MediaQueryListEvent
    for (const listener of entry.listeners) {
      listener(event)
    }
  }
}

beforeEach(() => {
  tracked = []
  setViewportWidth(1280)
  setPointerType('fine')
  localStorage.clear()
})

afterEach(() => {
  void i18n.changeLanguage('en-GB')
})

// ---------------------------------------------------------------------------
// Misc DOM stubs jsdom doesn't provide, needed by later tickets
// (dnd-kit, Modal focus trapping, user-event pointer capture, etc.)
// ---------------------------------------------------------------------------

class StubObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

window.ResizeObserver ??= StubObserver as unknown as typeof ResizeObserver
window.IntersectionObserver ??= StubObserver as unknown as typeof IntersectionObserver

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {}
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {}
}
