"""
Project Z - Dependencies
FastAPI dependency injection providers.
"""

from functools import wraps
from typing import Optional, Sequence
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_access_token
from app.database.session import get_db
from app.repositories.user import UserRepository

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Extract and validate the current user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = verify_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Get current user or None (for optional auth endpoints)."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


# ── Role-Based Access Control ────────────────────────────────

class RoleChecker:
    """
    Dependency that checks if the current user has one of the allowed role types.
    
    Usage:
        @router.get("/admin-only", dependencies=[Depends(RoleChecker(["super_admin", "admin"]))])
        async def admin_endpoint():
            ...
    """
    
    def __init__(self, allowed_role_types: Sequence[str]):
        self.allowed_role_types = list(allowed_role_types)
    
    async def __call__(
        self,
        current_user=Depends(get_current_user),
    ):
        if not current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No role assigned",
            )
        
        user_role_type = (
            current_user.role.role_type.value 
            if hasattr(current_user.role.role_type, 'value') 
            else str(current_user.role.role_type)
        )
        
        if user_role_type not in self.allowed_role_types:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {', '.join(self.allowed_role_types)}",
            )
        
        return current_user


# ── Pre-defined role checkers ────────────────────────────────

require_super_admin = RoleChecker(["super_admin"])
require_admin = RoleChecker(["super_admin", "admin", "ict_administrator"])
require_hr_admin = RoleChecker(["super_admin", "admin", "hr_administrator", "hr_manager", "hr_officer"])
require_operations = RoleChecker(["super_admin", "admin", "hr_administrator", "hr_manager", "hr_officer", "operations_manager"])
require_supervisor = RoleChecker(["super_admin", "admin", "hr_administrator", "hr_manager", "hr_officer", "operations_manager", "department_supervisor"])
require_auditor = RoleChecker(["super_admin", "admin", "hr_administrator", "hr_manager", "hr_officer", "operations_manager", "department_supervisor", "auditor"])
require_any_authenticated = RoleChecker(["super_admin", "admin", "ict_administrator", "hr_administrator", "hr_manager", "hr_officer", "operations_manager", "department_supervisor", "auditor", "viewer"])


# ── Permission-Based Access Control ──────────────────────────

class PermissionChecker:
    """
    Dependency that checks if the current user has a specific permission.
    
    Usage:
        @router.get("/reports", dependencies=[Depends(PermissionChecker("report:view"))])
        async def view_reports():
            ...
    """
    
    def __init__(self, required_permission: str):
        self.required_permission = required_permission
    
    async def __call__(
        self,
        current_user=Depends(get_current_user),
    ):
        if not current_user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No role assigned",
            )
        
        # Super admin has all permissions
        user_role_type = (
            current_user.role.role_type.value 
            if hasattr(current_user.role.role_type, 'value') 
            else str(current_user.role.role_type)
        )
        if user_role_type == "super_admin":
            return current_user
        
        if not current_user.has_permission(self.required_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {self.required_permission}",
            )
        
        return current_user
