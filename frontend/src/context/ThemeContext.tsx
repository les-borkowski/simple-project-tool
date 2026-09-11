import { useState, type ReactNode } from 'react'
import { ThemeContext, type AccentColor } from './theme-context'

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
