import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setPointerType, setViewportWidth } from '../test/setup'
import { useIsDesktopShell, useIsMobile, useMediaQuery } from './useMediaQuery'

describe('useIsMobile', () => {
  it('is true when the viewport is narrower than the mobile breakpoint', () => {
    setViewportWidth(375)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('is false when the viewport is at desktop width', () => {
    setViewportWidth(1280)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })
})

describe('useIsDesktopShell', () => {
  it('is false when the viewport is narrower than the desktop breakpoint', () => {
    setViewportWidth(375)
    const { result } = renderHook(() => useIsDesktopShell())
    expect(result.current).toBe(false)
  })

  it('is true when the viewport is at desktop width', () => {
    setViewportWidth(1280)
    const { result } = renderHook(() => useIsDesktopShell())
    expect(result.current).toBe(true)
  })
})

describe('useMediaQuery re-rendering', () => {
  it('updates the returned value when the viewport changes while mounted', () => {
    setViewportWidth(1280)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      setViewportWidth(375)
    })

    expect(result.current).toBe(true)
  })

  it('tracks pointer type changes via setPointerType', () => {
    setPointerType('fine')
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'))
    expect(result.current).toBe(false)

    act(() => {
      setPointerType('coarse')
    })

    expect(result.current).toBe(true)
  })

  it('returns false and does not throw for an unparseable query', () => {
    let hookResult: { current: boolean } | undefined
    expect(() => {
      const { result } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'))
      hookResult = result
    }).not.toThrow()
    expect(hookResult?.current).toBe(false)
  })
})
