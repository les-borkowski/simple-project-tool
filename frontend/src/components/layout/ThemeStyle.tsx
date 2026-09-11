import type { AccentColor } from '../../context/theme-context'

const ACCENTS: Record<AccentColor, { hex: string; soft: string; softDark: string; text: string; textDark: string }> = {
  indigo:  { hex:'#6366f1', soft:'#eef2ff', softDark:'#1e1b4b', text:'#4338ca', textDark:'#a5b4fc' },
  violet:  { hex:'#8b5cf6', soft:'#f5f3ff', softDark:'#2e1065', text:'#6d28d9', textDark:'#c4b5fd' },
  emerald: { hex:'#059669', soft:'#ecfdf5', softDark:'#022c22', text:'#047857', textDark:'#6ee7b7' },
  rose:    { hex:'#e11d48', soft:'#fff1f2', softDark:'#4c0519', text:'#be123c', textDark:'#fda4af' },
  amber:   { hex:'#d97706', soft:'#fffbeb', softDark:'#451a03', text:'#b45309', textDark:'#fcd34d' },
  stone:   { hex:'#0c0a09', soft:'#f5f5f4', softDark:'#1c1917', text:'#1c1917', textDark:'#e7e5e4' },
}

export function ThemeStyle({ accent }: { accent: AccentColor }) {
  const a = ACCENTS[accent] ?? ACCENTS.indigo
  return (
    <style>{`
      :root { --accent:${a.hex}; --accent-soft:${a.soft}; --accent-text:${a.text}; }
      .dark { --accent-soft:${a.softDark}; --accent-text:${a.textDark}; }
    `}</style>
  )
}
