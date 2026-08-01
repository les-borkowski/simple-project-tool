import { useIsMobile } from './useMediaQuery'

export interface TimelineMetrics {
  dayWidth: number
  leftCol: number
}

// The one place a JS media query is allowed to drive numbers (T17): Gantt bar
// positions are computed in JS from these pixel values, so CSS variants alone
// can't rescale them. Desktop (>=768px) values must stay exactly what the
// module constants were before this ticket (dayWidth 24, leftCol 220) so the
// >=1024px Gantt renders pixel-identically (global constraint 4).
export function useTimelineMetrics(): TimelineMetrics {
  const isMobile = useIsMobile()
  return isMobile ? { dayWidth: 12, leftCol: 120 } : { dayWidth: 24, leftCol: 220 }
}
