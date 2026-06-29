"""
Project Z - User and Role Models
System authentication and RBAC authorization.
"""

import enum
import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class RoleType(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    ICT_ADMINISTRATOR = "ict_administrator"
    HR_ADMINISTRATOR = "hr_administrator"
    HR_MANAGER = "hr_manager"
    HR_OFFICER = "hr_officer"
    OPERATIONS_MANAGER = "operations_manager"
    DEPARTMENT_SUPERVISOR = "department_supervisor"
    AUDITOR = "auditor"
    VIEWER = "viewer"


# ── Permission Definitions ────────────────────────────────────

class Permission(str, enum.Enum):
    # Employee Management
    EMPLOYEE_VIEW = "employee:view"
    EMPLOYEE_CREATE = "employee:create"
    EMPLOYEE_UPDATE = "employee:update"
    EMPLOYEE_DELETE = "employee:delete"
    EMPLOYEE_IMPORT = "employee:import"
    
    # Attendance Management
    ATTENDANCE_VIEW = "attendance:view"
    ATTENDANCE_MODIFY = "attendance:modify"
    ATTENDANCE_EXPORT = "attendance:export"
    
    # Department Management
    DEPARTMENT_VIEW = "department:view"
    DEPARTMENT_CREATE = "department:create"
    DEPARTMENT_UPDATE = "department:update"
    DEPARTMENT_DELETE = "department:delete"
    
    # Shift Management
    SHIFT_VIEW = "shift:view"
    SHIFT_CREATE = "shift:create"
    SHIFT_UPDATE = "shift:update"
    SHIFT_DELETE = "shift:delete"
    SHIFT_ASSIGN = "shift:assign"
    
    # Device Management
    DEVICE_VIEW = "device:view"
    DEVICE_UPDATE = "device:update"
    DEVICE_SYNC = "device:sync"
    DEVICE_CONFIGURE = "device:configure"
    
    # Report Access
    REPORT_VIEW = "report:view"
    REPORT_EXPORT = "report:export"
    REPORT_ANALYTICS = "report:analytics"
    
    # System Settings
    SETTINGS_VIEW = "settings:view"
    SETTINGS_UPDATE = "settings:update"
    
    # Audit Logs
    AUDIT_VIEW = "audit:view"
    AUDIT_EXPORT = "audit:export"
    
    # User Administration
    USER_VIEW = "user:view"
    USER_CREATE = "user:create"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"
    USER_DEACTIVATE = "user:deactivate"
    
    # Role Management
    ROLE_VIEW = "role:view"
    ROLE_MANAGE = "role:manage"
    
    # Security
    SECURITY_VIEW = "security:view"
    SECURITY_MANAGE = "security:manage"


# ── Default Permission Sets by Role ──────────────────────────

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    RoleType.SUPER_ADMIN: [p.value for p in Permission],  # All permissions
    RoleType.ADMIN: [
        Permission.EMPLOYEE_VIEW.value, Permission.EMPLOYEE_CREATE.value,
        Permission.EMPLOYEE_UPDATE.value, Permission.EMPLOYEE_DELETE.value,
        Permission.EMPLOYEE_IMPORT.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_MODIFY.value,
        Permission.ATTENDANCE_EXPORT.value,
        Permission.DEPARTMENT_VIEW.value, Permission.DEPARTMENT_CREATE.value,
        Permission.DEPARTMENT_UPDATE.value, Permission.DEPARTMENT_DELETE.value,
        Permission.SHIFT_VIEW.value, Permission.SHIFT_CREATE.value,
        Permission.SHIFT_UPDATE.value, Permission.SHIFT_DELETE.value,
        Permission.SHIFT_ASSIGN.value,
        Permission.DEVICE_VIEW.value, Permission.DEVICE_UPDATE.value,
        Permission.DEVICE_SYNC.value, Permission.DEVICE_CONFIGURE.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.REPORT_ANALYTICS.value,
        Permission.SETTINGS_VIEW.value, Permission.SETTINGS_UPDATE.value,
        Permission.AUDIT_VIEW.value, Permission.AUDIT_EXPORT.value,
        Permission.USER_VIEW.value, Permission.USER_CREATE.value,
        Permission.USER_UPDATE.value, Permission.USER_DELETE.value,
        Permission.USER_DEACTIVATE.value,
        Permission.ROLE_VIEW.value, Permission.ROLE_MANAGE.value,
        Permission.SECURITY_VIEW.value, Permission.SECURITY_MANAGE.value,
    ],
    RoleType.ICT_ADMINISTRATOR: [
        Permission.DEVICE_VIEW.value, Permission.DEVICE_UPDATE.value,
        Permission.DEVICE_SYNC.value, Permission.DEVICE_CONFIGURE.value,
        Permission.SETTINGS_VIEW.value, Permission.SETTINGS_UPDATE.value,
        Permission.USER_VIEW.value, Permission.USER_CREATE.value,
        Permission.USER_UPDATE.value, Permission.USER_DEACTIVATE.value,
        Permission.AUDIT_VIEW.value, Permission.SECURITY_VIEW.value,
        Permission.REPORT_VIEW.value,
    ],
    RoleType.HR_ADMINISTRATOR: [
        Permission.EMPLOYEE_VIEW.value, Permission.EMPLOYEE_CREATE.value,
        Permission.EMPLOYEE_UPDATE.value, Permission.EMPLOYEE_DELETE.value,
        Permission.EMPLOYEE_IMPORT.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_MODIFY.value,
        Permission.ATTENDANCE_EXPORT.value,
        Permission.DEPARTMENT_VIEW.value, Permission.DEPARTMENT_CREATE.value,
        Permission.DEPARTMENT_UPDATE.value,
        Permission.SHIFT_VIEW.value, Permission.SHIFT_CREATE.value,
        Permission.SHIFT_UPDATE.value, Permission.SHIFT_ASSIGN.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.REPORT_ANALYTICS.value,
        Permission.USER_VIEW.value,
        Permission.AUDIT_VIEW.value,
    ],
    RoleType.HR_MANAGER: [
        Permission.EMPLOYEE_VIEW.value, Permission.EMPLOYEE_CREATE.value,
        Permission.EMPLOYEE_UPDATE.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_MODIFY.value,
        Permission.ATTENDANCE_EXPORT.value,
        Permission.DEPARTMENT_VIEW.value,
        Permission.SHIFT_VIEW.value, Permission.SHIFT_CREATE.value,
        Permission.SHIFT_UPDATE.value, Permission.SHIFT_ASSIGN.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.REPORT_ANALYTICS.value,
        Permission.USER_VIEW.value,
    ],
    RoleType.HR_OFFICER: [
        Permission.EMPLOYEE_VIEW.value, Permission.EMPLOYEE_CREATE.value,
        Permission.EMPLOYEE_UPDATE.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_EXPORT.value,
        Permission.DEPARTMENT_VIEW.value,
        Permission.SHIFT_VIEW.value, Permission.SHIFT_ASSIGN.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.USER_VIEW.value,
    ],
    RoleType.OPERATIONS_MANAGER: [
        Permission.EMPLOYEE_VIEW.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_EXPORT.value,
        Permission.DEPARTMENT_VIEW.value,
        Permission.SHIFT_VIEW.value,
        Permission.DEVICE_VIEW.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.REPORT_ANALYTICS.value,
    ],
    RoleType.DEPARTMENT_SUPERVISOR: [
        Permission.EMPLOYEE_VIEW.value,
        Permission.ATTENDANCE_VIEW.value,
        Permission.DEPARTMENT_VIEW.value,
        Permission.SHIFT_VIEW.value,
        Permission.REPORT_VIEW.value,
    ],
    RoleType.AUDITOR: [
        Permission.EMPLOYEE_VIEW.value,
        Permission.ATTENDANCE_VIEW.value, Permission.ATTENDANCE_EXPORT.value,
        Permission.AUDIT_VIEW.value, Permission.AUDIT_EXPORT.value,
        Permission.REPORT_VIEW.value, Permission.REPORT_EXPORT.value,
        Permission.REPORT_ANALYTICS.value,
        Permission.SECURITY_VIEW.value,
    ],
    RoleType.VIEWER: [
        Permission.EMPLOYEE_VIEW.value,
        Permission.ATTENDANCE_VIEW.value,
        Permission.DEPARTMENT_VIEW.value,
        Permission.SHIFT_VIEW.value,
        Permission.DEVICE_VIEW.value,
        Permission.REPORT_VIEW.value,
    ],
}


class Role(BaseModel):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role_type: Mapped[RoleType] = mapped_column(
        SAEnum(RoleType, name="role_type", values_callable=lambda x: [e.value for e in x]),
        default=RoleType.VIEWER,
    )
    permissions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    is_active: Mapped[bool] = mapped_column(default=True)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="role")

    def has_permission(self, permission: str) -> bool:
        """Check if this role has a specific permission."""
        if not self.permissions:
            return False
        return permission in self.permissions.get("granted", [])

    def __repr__(self) -> str:
        return f"<Role(name='{self.name}')>"


class User(BaseModel):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Foreign Keys
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="SET NULL"),
        nullable=True,
    )
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    role: Mapped[Optional["Role"]] = relationship("Role", back_populates="users")

    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission via role."""
        if not self.role:
            return False
        return self.role.has_permission(permission)

    def __repr__(self) -> str:
        return f"<User(username='{self.username}')>"
