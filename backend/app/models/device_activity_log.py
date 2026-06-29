"""
Device Activity Log Model.

Tracks all device activities: ADMS heartbeats, data pushes,
restarts, user changes, template operations, etc.
Immutable audit trail for device operations.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDMixin


class DeviceActivityLog(Base, UUIDMixin):
    """One row per device activity event."""

    __tablename__ = "device_activity_logs"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # heartbeat, attendance_push, device_connected, device_disconnected,
    # device_restarted, user_added, user_removed, user_updated,
    # fingerprint_added, fingerprint_removed, face_added,
    # card_added, data_sync, firmware_update, ip_change
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )
