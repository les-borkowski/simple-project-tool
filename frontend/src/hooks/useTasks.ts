import { useCallback, useEffect } from 'react'
import { tasksApi } from '../services/api'
import type { TaskResponse, Status, Priority } from '../services/api'
import { usePagination } from './usePagination'

interface Filters {
  status?: Status | ''
  priority?: Priority | ''
  assignee_id?: string
  q?: string
}

export function useTasks(storyId: string, filters: Filters = {}) {
  const pagination = usePagination<TaskResponse>()

  const fetchFirst = useCallback(async () => {
    if (!storyId) return
    pagination.setIsLoading(true)
    pagination.setError(null)
    try {
      const params: Record<string, unknown> = { limit: 25 }
      if (filters.status) params.status = filters.status
      if (filters.priority) params.priority = filters.priority
      if (filters.assignee_id) params.assignee_id = filters.assignee_id
      if (filters.q) params.q = filters.q
      const res = await tasksApi.list(storyId, params)
      pagination.setPage(res.data.items, res.data.next_cursor)
    } catch {
      pagination.setError('Failed to load tasks')
    } finally {
      pagination.setIsLoading(false)
    }
  }, [storyId, filters.status, filters.priority, filters.assignee_id, filters.q])

  const loadMore = useCallback(async () => {
    if (!pagination.nextCursor) return
    pagination.setIsLoading(true)
    try {
      const res = await tasksApi.list(storyId, { limit: 25, cursor: pagination.nextCursor })
      pagination.appendPage(res.data.items, res.data.next_cursor)
    } finally {
      pagination.setIsLoading(false)
    }
  }, [storyId, pagination.nextCursor])

  useEffect(() => {
    fetchFirst()
  }, [fetchFirst])

  return { ...pagination, refresh: fetchFirst, loadMore }
}
