import { useEffect, useState } from 'react'
import { projectsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

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

  useEffect(() => {
    if (!projectId || !user) {
      // Fallback to global role
      setIsManager(user?.role === 'manager')
      setIsLoading(false)
      return
    }

    projectsApi.listMembers(projectId).then((res) => {
      const member = res.data.find((m) => m.user_id === user.id)
      if (member) {
        setIsManager(member.role === 'manager')
      } else {
        // owner is always manager; fall back to global role
        setIsManager(user.role === 'manager')
      }
    }).catch(() => {
      setIsManager(user.role === 'manager')
    }).finally(() => {
      setIsLoading(false)
    })
  }, [projectId, user])

  return { isManager, canDelete: isManager, canInvite: isManager, isLoading }
}
