"""
Employee Enrollment History Model.

Tracks when employees are enrolled/updated/removed on biometric devices.
Immutable audit trail for enrollment lifecycle.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDMixin


class EmployeeEnrollmentHistory(Base, UUIDMixin):
    """One row per enrollment event on a device."""

    __tablename__ = "employee_enrollment_history"

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
    device_user_id: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    action: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True
    )  # enrolled, updated, removed, synced
    enrollment_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="fingerprint"
    )  # fingerprint, face, card, password, full_profile
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
