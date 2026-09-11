import { useEffect, useState } from 'react'
import { projectsApi } from '../services/api'
import { useAuth } from '../context/auth-context'

interface RoleInfo {
  isManager: boolean
  canDelete: boolean
  canInvite: boolean
  isLoading: boolean
}

export function useRole(projectId?: string): RoleInfo {
  const { user } = useAuth()
  const [isManager, setIsManager] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // No project context (or no user yet) means there's nothing to fetch —
  // resolve synchronously from the user's global role. Adjust state during
  // render rather than from an effect: set-state-in-effect rejects a
  // synchronous write there, and this runs before children render, so there
  // is no cascading second pass. setState bails out once the values already
  // match, so this settles without looping.
  const globalIsManager = user?.role === 'manager'
  if ((!projectId || !user) && (isManager !== globalIsManager || isLoading)) {
    setIsManager(globalIsManager)
    setIsLoading(false)
  }

  useEffect(() => {
    if (!projectId || !user) return
    let cancelled = false
    projectsApi
      .listMembers(projectId)
      .then((res) => {
        const member = res.data.find((m) => m.user_id === user.id)
        if (!cancelled) setIsManager(member?.role === 'manager')
      })
      .catch(() => {
        if (!cancelled) setIsManager(false) // safe default on error — never elevate
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, user?.id])

  return { isManager, canDelete: isManager, canInvite: isManager, isLoading }
}
