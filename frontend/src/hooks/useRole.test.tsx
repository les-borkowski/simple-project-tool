import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return { ...actual, projectsApi: { ...actual.projectsApi, listMembers: vi.fn() } }
})

import { projectsApi } from '../services/api'
import { makeUser } from '../test/factories'
import { Providers } from '../test/render'
import { useRole } from './useRole'

const globalManager = makeUser({ id: 'u1', role: 'manager' })

function wrapperFor(user: ReturnType<typeof makeUser>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Providers auth={{ user, isAuthenticated: true }}>{children}</Providers>
  )
}

describe('useRole', () => {
  afterEach(() => vi.restoreAllMocks())

  it('re-arms isLoading when the project changes, so manager-only UI does not flash', async () => {
    // A global manager who is only a Contributor on the selected project: while the
    // membership request is in flight, isManager is still the global answer. If
    // isLoading is not re-armed on the projectId change, callers that gate on it render
    // manager-only controls for a round-trip before they vanish.
    let resolveMembers!: (value: unknown) => void
    vi.mocked(projectsApi.listMembers).mockImplementation(
      () => new Promise((resolve) => { resolveMembers = resolve }) as never
    )

    const { result, rerender } = renderHook(({ id }: { id?: string }) => useRole(id), {
      initialProps: { id: undefined as string | undefined },
      wrapper: wrapperFor(globalManager),
    })

    // No project: resolved synchronously from the global role.
    expect(result.current.isManager).toBe(true)
    expect(result.current.isLoading).toBe(false)

    rerender({ id: 'proj-1' })

    expect(result.current.isLoading).toBe(true)

    resolveMembers({ data: [{ user_id: 'u1', role: 'contributor' }] })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isManager).toBe(false)
  })

  it('still fails closed when the membership lookup errors', async () => {
    vi.mocked(projectsApi.listMembers).mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useRole('proj-1'), {
      wrapper: wrapperFor(globalManager),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isManager).toBe(false)
  })
})
