import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEscapeKey } from './useEscapeKey'

describe('useEscapeKey', () => {
  it('fires the handler when Escape is pressed while active', () => {
    const handler = vi.fn()
    renderHook(() => {
      useEscapeKey(true, handler)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire the handler when inactive', () => {
    const handler = vi.fn()
    renderHook(() => {
      useEscapeKey(false, handler)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not fire for keys other than Escape', () => {
    const handler = vi.fn()
    renderHook(() => {
      useEscapeKey(true, handler)
    })

    fireEvent.keyDown(document, { key: 'Enter' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('fires only the most recently activated handler when several are active (topmost overlay wins)', () => {
    const parentHandler = vi.fn()
    const childHandler = vi.fn()

    renderHook(() => {
      useEscapeKey(true, parentHandler)
    })
    renderHook(() => {
      useEscapeKey(true, childHandler)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(childHandler).toHaveBeenCalledTimes(1)
    expect(parentHandler).not.toHaveBeenCalled()
  })

  it('falls back to the next-most-recent active handler once the topmost is unmounted', () => {
    const parentHandler = vi.fn()
    const childHandler = vi.fn()

    renderHook(() => {
      useEscapeKey(true, parentHandler)
    })
    const child = renderHook(() => {
      useEscapeKey(true, childHandler)
    })

    child.unmount()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(parentHandler).toHaveBeenCalledTimes(1)
    expect(childHandler).not.toHaveBeenCalled()
  })
})
