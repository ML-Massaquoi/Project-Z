"""
Project Z - DeviceSyncStatus Model
Tracks synchronization state per device.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device


class SyncHealth(str):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class DeviceSyncStatus(BaseModel):
    """
    Tracks the synchronization state for a single device.
    Updated after every sync operation.
    """

    __tablename__ = "device_sync_status"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ── User counts ───────────────────────────────────────────
    total_users_on_device: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_users_synced: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Template counts ───────────────────────────────────────
    total_templates_stored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_templates_pushed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Pending operations ────────────────────────────────────
    pending_push_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_push_templates: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_syncs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Timestamps ────────────────────────────────────────────
    last_full_sync_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_push_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_pull_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Provisioning ──────────────────────────────────────────
    is_provisioned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    provisioned_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # ── Health ────────────────────────────────────────────────
    sync_health: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SyncHealth.UNKNOWN,
    )

    # ── Relationship ──────────────────────────────────────────
    device: Mapped["Device"] = relationship("Device", lazy="select")

    def __repr__(self) -> str:
        return (
            f"<DeviceSyncStatus(device={self.device_id}, "
            f"health={self.sync_health}, provisioned={self.is_provisioned})>"
        )
