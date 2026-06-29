"""
Project Z - Data Integrity Check Model
Records of integrity check runs and findings.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDMixin


class CheckSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class CheckCategory(str, enum.Enum):
    SCAN_SESSION = "scan_session"
    SESSION_INVARIANT = "session_invariant"
    SUMMARY_DRIFT = "summary_drift"
    ORPHAN_RECORD = "orphan_record"
    STUCK_PIPELINE = "stuck_pipeline"
    DAILY_REPORT = "daily_report"
    GENERAL = "general"


class DataIntegrityLog(Base, UUIDMixin):
    """One row per integrity check finding."""

    __tablename__ = "data_integrity_logs"

    check_category: Mapped[CheckCategory] = mapped_column(
        SAEnum(CheckCategory, name="integrity_check_category",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    severity: Mapped[CheckSeverity] = mapped_column(
        SAEnum(CheckSeverity, name="integrity_check_severity",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    check_name: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Affected records
    affected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affected_entity_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # e.g. "attendance_session", "scan_event"
    affected_ids: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True
    )  # list of affected record IDs

    # Resolution
    resolved: Mapped[bool] = mapped_column(nullable=False, default=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Run context
    run_by: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )  # "integrity_worker" | "manual"
    run_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True
    )  # groups findings from same run

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
