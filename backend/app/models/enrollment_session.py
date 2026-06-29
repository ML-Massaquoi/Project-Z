"""
Project Z - Enrollment Session Model
Tracks biometric enrollment sessions for employees.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee


class EnrollmentStatus(str):
    WAITING_FOR_FINGERPRINT = "waiting_for_fingerprint"
    FINGERPRINT_IN_PROGRESS = "fingerprint_in_progress"
    FINGERPRINT_CAPTURED = "fingerprint_captured"
    WAITING_FOR_FACE = "waiting_for_face"
    FACE_IN_PROGRESS = "face_in_progress"
    FACE_CAPTURED = "face_captured"
    ENROLLMENT_COMPLETE = "enrollment_complete"
    CANCELLED = "cancelled"
    FAILED = "failed"


class BiometricStatus(str):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    CAPTURED = "captured"
    SKIPPED = "skipped"
    FAILED = "failed"


class EnrollmentSession(BaseModel):
    """Tracks a biometric enrollment session for an employee on a device."""

    __tablename__ = "enrollment_sessions"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Session status
    status: Mapped[str] = mapped_column(
        String(30), nullable=False,
        server_default="waiting_for_fingerprint",
        index=True,
    )
    fingerprint_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="pending"
    )
    face_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="pending"
    )

    # Template counts
    fingerprint_template_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    face_template_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Audit
    started_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    started_by_username: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )
    fingerprint_captured_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    face_captured_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Additional data
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)

    # Relationships
    employee: Mapped["Employee"] = relationship("Employee")
    device: Mapped[Optional["Device"]] = relationship("Device")

    def __repr__(self) -> str:
        return (
            f"<EnrollmentSession(employee={self.employee_id}, "
            f"device={self.device_id}, status={self.status})>"
        )
