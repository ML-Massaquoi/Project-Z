import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface ProtectedRouteProps {
  permission?: string
  anyPermission?: string[]
  roles?: string[]
}

export default function ProtectedRoute({ permission, anyPermission, roles }: ProtectedRouteProps) {
  const { isAuthenticated, user, hasPermission, hasAnyPermission } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  if (anyPermission && anyPermission.length > 0 && !hasAnyPermission(...anyPermission)) {
    return <Navigate to="/" replace />
  }

  if (roles && roles.length > 0 && user?.role && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
