"""
Project Z - Device Health Log Model
Time-series health check records for each device.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDMixin


class HealthCheckResult(str, enum.Enum):
    SUCCESS = "success"
    TIMEOUT = "timeout"
    CONNECTION_REFUSED = "connection_refused"
    SDK_ERROR = "sdk_error"
    UNKNOWN_ERROR = "unknown_error"


class DeviceHealthLog(Base, UUIDMixin):
    """One row per health probe attempt against a device."""

    __tablename__ = "device_health_logs"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Probe result
    check_result: Mapped[HealthCheckResult] = mapped_column(
        SAEnum(HealthCheckResult, name="health_check_result",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Device state at probe time
    device_online: Mapped[Optional[bool]] = mapped_column(nullable=True)
    scan_count_at_check: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Context
    checked_by: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # "health_worker" | "manual"

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
