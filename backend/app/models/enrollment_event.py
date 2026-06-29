"""
Project Z - Enrollment Event Model
Real-time enrollment events for WebSocket broadcasting.
"""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee
    from app.models.enrollment_session import EnrollmentSession


class EnrollmentEvent(BaseModel):
    """Individual enrollment event for real-time tracking."""

    __tablename__ = "enrollment_events"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enrollment_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True,
        comment="started, fingerprint_captured, face_captured, completed, failed, cancelled"
    )
    biometric_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="fingerprint, face, card, password"
    )
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationships
    session: Mapped["EnrollmentSession"] = relationship("EnrollmentSession")
    employee: Mapped["Employee"] = relationship("Employee")
    device: Mapped[Optional["Device"]] = relationship("Device")

    def __repr__(self) -> str:
        return (
            f"<EnrollmentEvent(session={self.session_id}, "
            f"type={self.event_type}, biometric={self.biometric_type})>"
        )
