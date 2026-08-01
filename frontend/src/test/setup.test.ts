import { describe, expect, it, vi } from 'vitest'
import { setPointerType, setViewportWidth } from './setup'

describe('matchMedia test harness', () => {
  it('reflects viewport width through max-width and min-width queries', () => {
    setViewportWidth(375)
    expect(window.matchMedia('(max-width: 767.98px)').matches).toBe(true)
    expect(window.matchMedia('(min-width: 1024px)').matches).toBe(false)

    setViewportWidth(1280)
    expect(window.matchMedia('(max-width: 767.98px)').matches).toBe(false)
    expect(window.matchMedia('(min-width: 1024px)').matches).toBe(true)
  })

  it('does not throw for non-width queries and defaults them to false', () => {
    expect(() => window.matchMedia('(prefers-color-scheme: dark)')).not.toThrow()
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false)
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false)
  })

  it('notifies listeners registered via addEventListener on viewport change', () => {
    setViewportWidth(1280)
    const mql = window.matchMedia('(max-width: 767.98px)')
    const listener = vi.fn()
    mql.addEventListener('change', listener)

    setViewportWidth(375)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].matches).toBe(true)
  })

  it('defaults to a fine pointer with hover support', () => {
    expect(window.matchMedia('(pointer: fine)').matches).toBe(true)
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false)
    expect(window.matchMedia('(hover: hover)').matches).toBe(true)
    expect(window.matchMedia('(hover: none)').matches).toBe(false)
  })

  it('flips pointer and hover queries when setPointerType("coarse") is called', () => {
    setPointerType('coarse')

    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true)
    expect(window.matchMedia('(pointer: fine)').matches).toBe(false)
    expect(window.matchMedia('(hover: none)').matches).toBe(true)
    expect(window.matchMedia('(hover: hover)').matches).toBe(false)
  })

  it('resets pointer type back to fine between tests', () => {
    // The previous test set the pointer type to 'coarse'; beforeEach should
    // have reset it to the desktop default before this test ran.
    expect(window.matchMedia('(pointer: fine)').matches).toBe(true)
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false)
  })
})
