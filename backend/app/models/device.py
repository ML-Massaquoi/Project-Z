"""
Project Z - Device Model
Biometric attendance terminals (RONASOFT / ZKTeco).
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.office import Office
    from app.models.device_group import DeviceGroup


class DeviceHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


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

    # Health monitoring
    health_status: Mapped[str] = mapped_column(
        String(20), default="unknown", nullable=False
    )
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_health_check: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    avg_response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_scan_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ADMS config
    adms_port: Mapped[int] = mapped_column(default=8081)
    sdk_port: Mapped[int] = mapped_column(default=4370)

    # Sync status
    is_provisioned: Mapped[bool] = mapped_column(default=False, nullable=False)
    provisioned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sync_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    total_users_synced: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_templates_synced: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    device_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("device_groups.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    office: Mapped[Optional["Office"]] = relationship("Office", back_populates="devices")
    department: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="devices"
    )
    device_group: Mapped[Optional["DeviceGroup"]] = relationship(
        "DeviceGroup", back_populates="devices"
    )

    def __repr__(self) -> str:
        return f"<Device(sn='{self.serial_number}', ip='{self.ip_address}')>"
