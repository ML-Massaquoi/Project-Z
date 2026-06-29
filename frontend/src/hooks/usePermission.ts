import { useAuthStore } from '@/stores/authStore'

export function usePermission() {
  const { user, hasPermission, hasAnyPermission } = useAuthStore()

  const can = (permission: string): boolean => hasPermission(permission)
  const canAny = (...permissions: string[]): boolean => hasAnyPermission(...permissions)
  const isRole = (...roles: string[]): boolean => {
    if (!user?.role) return false
    return roles.includes(user.role)
  }
  const isAdmin = user?.role_type === 'admin' || user?.role_type === 'super_admin'
  const isSuperAdmin = user?.role_type === 'super_admin'

  return { can, canAny, isRole, isAdmin, isSuperAdmin }
}
