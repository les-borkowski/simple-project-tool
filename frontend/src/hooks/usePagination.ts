import { useState, useCallback } from 'react'

export function usePagination<T>() {
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setPage = useCallback((newItems: T[], cursor: string | null) => {
    setItems(newItems)
    setNextCursor(cursor)
  }, [])

  const appendPage = useCallback((newItems: T[], cursor: string | null) => {
    setItems((prev) => [...prev, ...newItems])
    setNextCursor(cursor)
  }, [])

  const reset = useCallback(() => {
    setItems([])
    setNextCursor(null)
    setError(null)
  }, [])

  return { items, nextCursor, isLoading, setIsLoading, error, setError, setPage, appendPage, reset }
}
