"""
Project Z - Face Template Model
Stores face biometric templates captured during enrollment.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee
    from app.models.enrollment_session import EnrollmentSession


class FaceTemplate(BaseModel):
    """Face biometric template captured from a biometric device."""

    __tablename__ = "face_templates"

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
    enrollment_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("enrollment_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Template data
    template_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    template_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    template_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Face image (if device supports capture)
    face_image: Mapped[Optional[bytes]] = mapped_column(
        LargeBinary, nullable=True, comment="Face photo if device supports capture"
    )

    # Metadata
    face_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1)
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Sync tracking
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    employee: Mapped["Employee"] = relationship("Employee")
    device: Mapped[Optional["Device"]] = relationship("Device")
    enrollment_session: Mapped[Optional["EnrollmentSession"]] = relationship("EnrollmentSession")

    def __repr__(self) -> str:
        return (
            f"<FaceTemplate(employee={self.employee_id}, "
            f"size={self.template_size}, quality={self.quality_score})>"
        )
