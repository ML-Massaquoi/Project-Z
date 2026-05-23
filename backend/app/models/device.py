"""
Project Z - Device Model
Biometric attendance terminals (RONASOFT / ZKTeco).
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.office import Office


class Device(BaseModel):
    __tablename__ = "devices"

    serial_number: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    platform: Mapped[str] = mapped_column(String(50), default="ZMM220_TFT")
    firmware_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status
    is_online: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_activity: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ADMS config
    adms_port: Mapped[int] = mapped_column(default=8081)
    sdk_port: Mapped[int] = mapped_column(default=4370)

    # Foreign Keys
    office_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("offices.id", ondelete="SET NULL"),
        nullable=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    office: Mapped[Optional["Office"]] = relationship("Office", back_populates="devices")
    department: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="devices"
    )

    def __repr__(self) -> str:
        return f"<Device(sn='{self.serial_number}', ip='{self.ip_address}')>"
