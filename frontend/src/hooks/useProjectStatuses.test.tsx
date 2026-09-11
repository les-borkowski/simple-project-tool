import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    statusesApi: { ...actual.statusesApi, list: vi.fn() },
  }
})

import { statusesApi } from '../services/api'
import { makeProjectStatus } from '../test/factories'
import { useProjectStatuses } from './useProjectStatuses'

describe('useProjectStatuses refresh()', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a promise that settles only once the refetched statuses have landed', async () => {
    // ProjectStatusManager writes `await refresh()` on its reorder-failure path. If
    // refresh() returns undefined that await is a no-op that resolves on the next
    // microtask, so any code after it runs while the hook still holds the stale list.
    // The component currently survives that because it unmounts its rows while
    // loading — this keeps the hook's own contract honest so it does not depend on
    // that coincidence.
    vi.mocked(statusesApi.list).mockResolvedValue({
      data: [makeProjectStatus({ id: 's1', name: 'To Do', order: 0 })],
    } as never)

    const { result } = renderHook(() => useProjectStatuses('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let resolveRefetch!: (value: unknown) => void
    vi.mocked(statusesApi.list).mockImplementationOnce(
      () => new Promise((resolve) => { resolveRefetch = resolve }) as never
    )

    let settled = false
    await act(async () => {
      void result.current.refresh()?.then(() => { settled = true })
    })

    expect(settled).toBe(false)

    await act(async () => {
      resolveRefetch({ data: [makeProjectStatus({ id: 's2', name: 'Done', order: 0 })] })
    })

    await waitFor(() => expect(settled).toBe(true))
    expect(result.current.statuses.map((s) => s.name)).toEqual(['Done'])
  })

  it('is not resolved by a fetch that started before the refresh and was superseded by it', async () => {
    // The resolver must belong to the refetch that refresh() triggered. If it is
    // settled by whichever request happens to land next — including an earlier one
    // whose data is discarded — then `await refresh()` returns with the hook still
    // holding the stale list, which is the exact failure the promise exists to prevent.
    let resolveFirst!: (value: unknown) => void
    vi.mocked(statusesApi.list).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve }) as never
    )

    const { result } = renderHook(() => useProjectStatuses('proj-1'))

    let resolveSecond!: (value: unknown) => void
    vi.mocked(statusesApi.list).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSecond = resolve }) as never
    )

    let settled = false
    await act(async () => {
      void result.current.refresh().then(() => { settled = true })
    })

    // The in-flight first fetch lands. Its data is superseded and discarded, so it must
    // not be what satisfies the caller waiting on refresh().
    await act(async () => {
      resolveFirst({ data: [makeProjectStatus({ id: 'stale', name: 'Stale', order: 0 })] })
    })

    expect(settled).toBe(false)

    await act(async () => {
      resolveSecond({ data: [makeProjectStatus({ id: 'fresh', name: 'Fresh', order: 0 })] })
    })

    await waitFor(() => expect(settled).toBe(true))
    expect(result.current.statuses.map((s) => s.name)).toEqual(['Fresh'])
  })

  it('settles the returned promise even when the refetch fails, so callers cannot hang', async () => {
    vi.mocked(statusesApi.list).mockResolvedValue({ data: [] } as never)

    const { result } = renderHook(() => useProjectStatuses('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(statusesApi.list).mockRejectedValueOnce(new Error('network error'))

    let settled = false
    await act(async () => {
      void result.current.refresh().then(() => { settled = true })
    })

    await waitFor(() => expect(settled).toBe(true))
  })

  it('settles pending callers on unmount rather than leaving promises forever pending', async () => {
    vi.mocked(statusesApi.list).mockResolvedValue({ data: [] } as never)
    const { result, unmount } = renderHook(() => useProjectStatuses('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Nothing will ever supersede this one — the component is about to go away.
    vi.mocked(statusesApi.list).mockImplementationOnce(() => new Promise(() => {}) as never)

    let settled = false
    await act(async () => {
      void result.current.refresh().then(() => { settled = true })
    })

    unmount()

    await waitFor(() => expect(settled).toBe(true))
  })

  it('settles when there is no project to load, so a caller cannot hang', async () => {
    const { result } = renderHook(() => useProjectStatuses(undefined))

    let settled = false
    await act(async () => {
      void result.current.refresh().then(() => { settled = true })
    })

    await waitFor(() => expect(settled).toBe(true))
  })
})
