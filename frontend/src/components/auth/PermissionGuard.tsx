import { usePermission } from '@/hooks/usePermission'

interface PermissionGuardProps {
  permission?: string
  anyPermission?: string[]
  roles?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function PermissionGuard({
  permission,
  anyPermission,
  roles,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { can, canAny, isRole } = usePermission()

  let allowed = true

  if (permission) {
    allowed = can(permission)
  }

  if (anyPermission && anyPermission.length > 0) {
    allowed = canAny(...anyPermission)
  }

  if (roles && roles.length > 0) {
    allowed = isRole(...roles)
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}
