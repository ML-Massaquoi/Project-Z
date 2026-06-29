"""
Project Z - DeviceUser Model
Stores biometric device-local user registry.
Synced from devices via TCP SDK (pyzk).
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee


class DeviceUser(BaseModel):
    """
    A user record as stored on a biometric device.
    Synced from device via TCP SDK (pyzk).
    """

    __tablename__ = "device_users"

    # Device context
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Device-local user info
    device_user_id: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="The user ID as stored on the biometric device"
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    privilege: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    card_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    group_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Biometric template status
    fingerprint_count: Mapped[int] = mapped_column(Integer, default=0)
    face_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    password_set: Mapped[bool] = mapped_column(Boolean, default=False)

    # Employee mapping
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Sync tracking
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    first_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Raw device payload
    raw_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Relationships
    device: Mapped["Device"] = relationship("Device")
    employee: Mapped[Optional["Employee"]] = relationship("Employee")

    def __repr__(self) -> str:
        return (
            f"<DeviceUser(device={self.device_id}, "
            f"user_id={self.device_user_id}, name={self.name})>"
        )
