"""
Employee Device Assignment Model.

Controls which devices an employee's biometric data is synced to.
Supports both individual device and group-based assignments.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class EmployeeDeviceAssignment(BaseModel):
    """Maps employees to specific devices for biometric sync control."""

    __tablename__ = "employee_device_assignments"
    __table_args__ = (
        UniqueConstraint("employee_id", "device_id", name="uq_emp_device_assignment"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_by: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    sync_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending, synced, failed
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class EmployeeDeviceGroupAssignment(BaseModel):
    """Maps employees to device groups for bulk sync control."""

    __tablename__ = "employee_device_group_assignments"
    __table_args__ = (
        UniqueConstraint("employee_id", "group_id", name="uq_emp_group_assignment"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("device_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_by: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
