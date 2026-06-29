"""
Project Z - Attendance Models
AttendanceLog, AttendanceSession, and RawAttendancePayload.
"""

import enum
import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee


class AttendanceStatus(str, enum.Enum):
    ON_TIME = "on_time"
    LATE = "late"
    EARLY_DEPARTURE = "early_departure"
    ABSENT = "absent"
    HALF_DAY = "half_day"


class VerifyType(str, enum.Enum):
    FINGERPRINT = "fingerprint"
    FACE = "face"
    CARD = "card"
    PASSWORD = "password"
    OTHER = "other"


class PunchDirection(str, enum.Enum):
    IN = "in"
    OUT = "out"
    UNKNOWN = "unknown"


class AttendanceLog(BaseModel):
    """Individual attendance punch events from devices."""

    __tablename__ = "attendance_logs"

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
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    device_user_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    verify_type: Mapped[VerifyType] = mapped_column(
        SAEnum(VerifyType, name="verify_type", values_callable=lambda x: [e.value for e in x]),
        default=VerifyType.FINGERPRINT,
    )
    punch_direction: Mapped[PunchDirection] = mapped_column(
        SAEnum(PunchDirection, name="punch_direction", values_callable=lambda x: [e.value for e in x]),
        default=PunchDirection.UNKNOWN,
    )
    work_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(default=False)

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="attendance_logs"
    )
    device: Mapped[Optional["Device"]] = relationship("Device")

    def __repr__(self) -> str:
        return f"<AttendanceLog(employee={self.employee_id}, time={self.timestamp}, dir={self.punch_direction})>"


class AttendanceSession(BaseModel):
    """Computed attendance sessions (check-in to check-out pairs)."""

    __tablename__ = "attendance_sessions"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    check_in: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    check_out: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    check_in_device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    check_out_device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Computed fields
    duration_minutes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    late_minutes: Mapped[Optional[float]] = mapped_column(Float, default=0)
    early_minutes: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    overtime_minutes: Mapped[Optional[float]] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(50), default="on_time")

    # Shift context (added in migration 0013)
    shift_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    shift_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    shift_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    is_complete: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="attendance_sessions"
    )
    check_in_device: Mapped[Optional["Device"]] = relationship(
        "Device", foreign_keys=[check_in_device_id]
    )
    check_out_device: Mapped[Optional["Device"]] = relationship(
        "Device", foreign_keys=[check_out_device_id]
    )

    def __repr__(self) -> str:
        return f"<AttendanceSession(employee={self.employee_id}, date={self.date}, status={self.status})>"


class RawAttendancePayload(BaseModel):
    """Raw ADMS payloads stored for debugging and audit trail."""

    __tablename__ = "raw_attendance_payloads"

    device_serial: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    source_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    table_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    stamp: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    processed: Mapped[bool] = mapped_column(default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    records_count: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:
        return f"<RawPayload(device='{self.device_serial}', processed={self.processed})>"
