import { createContext, useContext, useState, type ReactNode } from 'react'

export type AccentColor = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'stone'
export type Density = 'compact' | 'balanced' | 'spacious'

interface ThemeContextValue {
  accent: AccentColor
  setAccent: (accent: AccentColor) => void
  density: Density
  setDensity: (density: Density) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>(() => {
    const stored = localStorage.getItem('spt-accent')
    return (stored as AccentColor) ?? 'indigo'
  })

  const [density, setDensityState] = useState<Density>(() => {
    const stored = localStorage.getItem('spt-density')
    return (stored as Density) ?? 'balanced'
  })

  const setAccent = (a: AccentColor) => {
    setAccentState(a)
    localStorage.setItem('spt-accent', a)
  }

  const setDensity = (d: Density) => {
    setDensityState(d)
    localStorage.setItem('spt-density', d)
  }

  return (
    <ThemeContext.Provider value={{ accent, setAccent, density, setDensity }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
