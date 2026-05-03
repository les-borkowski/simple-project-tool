import { createContext, useContext, useState, type ReactNode } from 'react'

export type AccentColor = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'stone'

interface ThemeContextValue {
  accent: AccentColor
  setAccent: (accent: AccentColor) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>(() => {
    const stored = localStorage.getItem('spt-accent')
    return (stored as AccentColor) ?? 'indigo'
  })

  const setAccent = (a: AccentColor) => {
    setAccentState(a)
    localStorage.setItem('spt-accent', a)
  }

  return (
    <ThemeContext.Provider value={{ accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
