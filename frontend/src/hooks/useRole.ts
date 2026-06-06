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
      setIsManager(user?.role === 'manager')
      setIsLoading(false)
      return
    }

    projectsApi.listMembers(projectId).then((res) => {
      const member = res.data.find((m) => m.user_id === user.id)
      setIsManager(member?.role === 'manager' ?? false)
    }).catch(() => {
      setIsManager(false)  // safe default on error — never elevate
    }).finally(() => {
      setIsLoading(false)
    })
  }, [projectId, user?.id])

  return { isManager, canDelete: isManager, canInvite: isManager, isLoading }
}
