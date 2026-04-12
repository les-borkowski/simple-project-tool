import { useCallback, useEffect } from 'react'
import { storiesApi } from '../services/api'
import type { StoryResponse, Status, Priority } from '../services/api'
import { usePagination } from './usePagination'

interface Filters {
  status?: Status | ''
  priority?: Priority | ''
  q?: string
}

export function useStories(projectId: string, filters: Filters = {}) {
  const pagination = usePagination<StoryResponse>()

  const fetchFirst = useCallback(async () => {
    if (!projectId) return
    pagination.setIsLoading(true)
    pagination.setError(null)
    try {
      const params: Record<string, unknown> = { limit: 25 }
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority
      if (filters.q) params.q = filters.q
      const res = await storiesApi.list(projectId, params)
      pagination.setPage(res.data.items, res.data.next_cursor)
    } catch {
      pagination.setError('Failed to load stories')
    } finally {
      pagination.setIsLoading(false)
    }
  }, [projectId, filters.status, filters.priority, filters.q])

  const loadMore = useCallback(async () => {
    if (!pagination.nextCursor) return
    pagination.setIsLoading(true)
    try {
      const res = await storiesApi.list(projectId, { limit: 25, cursor: pagination.nextCursor })
      pagination.appendPage(res.data.items, res.data.next_cursor)
    } finally {
      pagination.setIsLoading(false)
    }
  }, [projectId, pagination.nextCursor])

  useEffect(() => {
    fetchFirst()
  }, [fetchFirst])

  return { ...pagination, refresh: fetchFirst, loadMore }
}
