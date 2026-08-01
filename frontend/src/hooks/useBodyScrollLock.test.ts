import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useBodyScrollLock } from './useBodyScrollLock'

describe('useBodyScrollLock', () => {
  let originalOverflow: string

  beforeEach(() => {
    originalOverflow = document.body.style.overflow
  })

  afterEach(() => {
    document.body.style.overflow = originalOverflow
  })

  it('locks document.body scrolling when active', () => {
    renderHook(() => {
      useBodyScrollLock(true)
    })

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not lock the body when inactive', () => {
    renderHook(() => {
      useBodyScrollLock(false)
    })

    expect(document.body.style.overflow).toBe(originalOverflow)
  })

  it('restores the original overflow when the sole lock is released', () => {
    document.body.style.overflow = 'scroll'
    const before = document.body.style.overflow

    const { unmount } = renderHook(() => {
      useBodyScrollLock(true)
    })

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe(before)
  })

  it('is ref-counted: body stays locked until every consumer releases', () => {
    const before = document.body.style.overflow

    const first = renderHook(() => {
      useBodyScrollLock(true)
    })
    const second = renderHook(() => {
      useBodyScrollLock(true)
    })

    expect(document.body.style.overflow).toBe('hidden')

    first.unmount()

    // second consumer is still active, body must remain locked
    expect(document.body.style.overflow).toBe('hidden')

    second.unmount()

    expect(document.body.style.overflow).toBe(before)
  })
})
