import { useCallback, useEffect, useState } from 'react'
import { sprintsApi } from '../services/api'
import type { SprintResponse } from '../services/api'

export function useProjectSprints(projectId: string | undefined) {
  const [sprints, setSprints] = useState<SprintResponse[]>([])
  const [error, setError] = useState<string | null>(null)
  // Bumped by refresh() to re-run the effect. The fetch cannot simply be
  // called from the effect body: react-hooks/set-state-in-effect follows the
  // call into it and rejects the setState inside, so the request has to be
  // started here and every setState kept inside a promise callback.
  const [reloadKey, setReloadKey] = useState(0)
  // The (projectId, reloadKey) pair the currently-held sprints were loaded
  // for. Compared against the pair we currently want, below.
  const target = `${projectId ?? ''}:${reloadKey}`
  const [loadedTarget, setLoadedTarget] = useState<string | null>(null)
  // Derived, not stored: the request starts during render-triggered effect
  // work, so there is no legal point to write `loading = true` from.
  // Comparing the last-settled target to the currently desired one gives the
  // same answer without a setState in the effect body — and, unlike keying
  // on reloadKey alone, also re-arms on a plain projectId change (no
  // explicit refresh()), matching the original fetch-on-every-dependency-
  // change behaviour. It also self-corrects to false the instant projectId
  // goes falsy, even if a fetch is still in flight and its cleanup suppresses
  // the settle below — so this cannot get stuck true.
  const loading = !!projectId && loadedTarget !== target

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    // Computed from this effect's own dependencies, not closed over from
    // outside — keeps this in sync with `target` above without adding an
    // exhaustive-deps warning for a value that only ever changes when
    // projectId/reloadKey (already deps) do.
    const settledTarget = `${projectId}:${reloadKey}`
    sprintsApi
      .list(projectId)
      .then((res) => {
        if (!cancelled) {
          setSprints(res.data)
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load sprints')
      })
      .finally(() => {
        if (!cancelled) setLoadedTarget(settledTarget)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadKey])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  return { sprints, loading, error, refresh }
}
