"""
Project Z - System Alert Model
Server-persisted operational alerts with severity levels.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    Boolean,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.base import Base


class AlertSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    EMERGENCY = "EMERGENCY"


class AlertCategory(str, enum.Enum):
    DEVICE = "device"
    ATTENDANCE = "attendance"
    SYSTEM = "system"
    SECURITY = "security"
    OPERATIONAL = "operational"


class SystemAlert(Base):
    """Server-persisted operational alert."""

    __tablename__ = "system_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Alert core
    severity = Column(
        Enum(AlertSeverity, name="alert_severity", values_callable=lambda x: [e.value for e in x]),
        nullable=False, index=True,
    )
    category = Column(
        Enum(AlertCategory, name="alert_category", values_callable=lambda x: [e.value for e in x]),
        nullable=False, index=True,
    )
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)

    # Source tracking
    source = Column(String(100), nullable=True)  # e.g. "attendance_worker", "device_monitor"
    source_id = Column(String(100), nullable=True)  # e.g. device_id, employee_id
    event_type = Column(String(100), nullable=True)  # e.g. "device_offline", "late_employee"

    # State
    acknowledged = Column(Boolean, default=False, nullable=False, index=True)
    acknowledged_by = Column(String(100), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    # Context
    # NOTE: "metadata" is reserved by SQLAlchemy's Declarative API, so the Python
    # attribute is named "extra" while the database column remains "metadata".
    extra = Column("metadata", JSONB, nullable=True)
    resolution_note = Column(Text, nullable=True)

    # Auto-expiry
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_system_alerts_category_severity", "category", "severity"),
        Index("ix_system_alerts_created_acknowledged", "created_at", "acknowledged"),
    )

    def __repr__(self):
        return f"<SystemAlert {self.severity.value} [{self.category.value}] {self.title}>"
