import { useCallback, useEffect, useState } from 'react'
import { projectsApi } from '../services/api'
import type { ProjectResponse, Status, Priority } from '../services/api'
import { usePagination } from './usePagination'

interface Filters {
  status?: Status | ''
  priority?: Priority | ''
  archived?: boolean
  q?: string
}

export function useProjects(filters: Filters = {}) {
  const pagination = usePagination<ProjectResponse>()
  const [initialized, setInitialized] = useState(false)

  const fetchFirst = useCallback(async () => {
    pagination.setIsLoading(true)
    pagination.setError(null)
    try {
      const params: Record<string, unknown> = { limit: 25 }
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority
      if (filters.archived) params.archived = true
      if (filters.q) params.q = filters.q
      const res = await projectsApi.list(params)
      pagination.setPage(res.data.items, res.data.next_cursor)
    } catch {
      pagination.setError('Failed to load projects')
    } finally {
      pagination.setIsLoading(false)
      setInitialized(true)
    }
  }, [filters.status, filters.priority, filters.archived, filters.q])

  const loadMore = useCallback(async () => {
    if (!pagination.nextCursor) return
    pagination.setIsLoading(true)
    try {
      const params: Record<string, unknown> = { limit: 25, cursor: pagination.nextCursor }
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority
      const res = await projectsApi.list(params)
      pagination.appendPage(res.data.items, res.data.next_cursor)
    } finally {
      pagination.setIsLoading(false)
    }
  }, [pagination.nextCursor, filters.status, filters.priority])

  useEffect(() => {
    fetchFirst()
  }, [fetchFirst])

  return { ...pagination, initialized, refresh: fetchFirst, loadMore }
}
