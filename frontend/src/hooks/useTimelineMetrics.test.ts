import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setViewportWidth } from '../test/setup'
import { useTimelineMetrics } from './useTimelineMetrics'

// ---------------------------------------------------------------------------
// T17 AC1 — useTimelineMetrics is the one place a JS media query is allowed to
// drive numbers, because Gantt bar positions are computed in JS and CSS can't
// rescale them. Desktop (1280px) values must stay exactly what the module
// constants are today (dayWidth 24, leftCol 220) so the ≥1024px Gantt is
// pixel-identical to before this ticket (global constraint 4).
//
// beforeEach in src/test/setup.ts resets the viewport to 1280px, so each test
// below sets the width it actually needs rather than relying on that default.
// ---------------------------------------------------------------------------

describe('useTimelineMetrics', () => {
  it('returns dayWidth 12 and leftCol 120 at a 375px (phone) viewport', () => {
    setViewportWidth(375)
    const { result } = renderHook(() => useTimelineMetrics())

    expect(result.current.dayWidth).toBe(12)
    expect(result.current.leftCol).toBe(120)
  })

  it('returns dayWidth 24 and leftCol 220 at a 1280px (desktop) viewport', () => {
    setViewportWidth(1280)
    const { result } = renderHook(() => useTimelineMetrics())

    expect(result.current.dayWidth).toBe(24)
    expect(result.current.leftCol).toBe(220)
  })

  it('updates the returned metrics when the viewport changes while mounted', () => {
    // Proves the hook is reactive rather than a read-once window.innerWidth
    // snapshot: a naive read would return stale numbers after this resize.
    setViewportWidth(1280)
    const { result } = renderHook(() => useTimelineMetrics())
    expect(result.current).toEqual({ dayWidth: 24, leftCol: 220 })

    act(() => {
      setViewportWidth(375)
    })

    expect(result.current).toEqual({ dayWidth: 12, leftCol: 120 })
  })
})
