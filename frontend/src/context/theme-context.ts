import { createContext, useContext } from 'react'

export type AccentColor = 'indigo' | 'violet' | 'emerald' | 'rose' | 'amber' | 'stone'

export interface ThemeContextValue {
  accent: AccentColor
  setAccent: (accent: AccentColor) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
