import { useCallback, useEffect, useState } from 'react'
import { sprintsApi } from '../services/api'
import type { SprintResponse } from '../services/api'

export function useProjectSprints(projectId: string | undefined) {
  const [sprints, setSprints] = useState<SprintResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await sprintsApi.list(projectId)
      setSprints(res.data)
    } catch {
      setError('Failed to load sprints')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { sprints, loading, error, refresh: fetch }
}
