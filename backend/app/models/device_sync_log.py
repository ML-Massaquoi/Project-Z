"""
Project Z - DeviceSyncLog Model
Immutable audit log for all synchronization operations.
"""

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device


class DeviceSyncLog(BaseModel):
    """
    Immutable log entry for every synchronization operation.
    Records what happened, when, who initiated it, and the result.
    """

    __tablename__ = "device_sync_logs"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Operation details ─────────────────────────────────────
    sync_type: Mapped[str] = mapped_column(
        String(30), nullable=False,
        comment="push_users, push_templates, pull_users, pull_templates, full_sync, provisioning",
    )
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False,
        comment="push, pull, bidirectional",
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running",
        comment="running, completed, failed, partial",
    )

    # ── Timing ────────────────────────────────────────────────
    started_at: Mapped[datetime] = mapped_column(
        nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── Counts ────────────────────────────────────────────────
    users_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    templates_affected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Error tracking ────────────────────────────────────────
    error_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # ── Audit ─────────────────────────────────────────────────
    initiated_by: Mapped[str] = mapped_column(
        String(256), nullable=False, default="system",
        comment="User ID or 'system' for automated syncs",
    )
    extra_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # ── Relationship ──────────────────────────────────────────
    device: Mapped["Device"] = relationship("Device", lazy="select")

    def __repr__(self) -> str:
        return (
            f"<DeviceSyncLog(device={self.device_id}, "
            f"type={self.sync_type}, status={self.status})>"
        )
