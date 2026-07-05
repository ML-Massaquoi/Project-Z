"""
Project Z - ShiftTemplate Model
Reusable shift definition with attendance windows and grace periods.
Replaces the existing Shift model as the authoritative shift definition.
"""
from datetime import time
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Integer, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class ShiftType:
    DAY = "day"
    NIGHT = "night"
    WEEKEND = "weekend"
    HOLIDAY = "holiday"
    OFF = "off"


class ShiftTemplate(BaseModel):
    __tablename__ = "shift_templates"
    __table_args__ = (
        CheckConstraint(
            "grace_period_minutes BETWEEN 0 AND 120",
            name="chk_shift_templates_grace_period",
        ),
        CheckConstraint(
            "late_threshold_minutes BETWEEN 0 AND 240",
            name="chk_shift_templates_late_threshold",
        ),
        CheckConstraint(
            "break_duration_minutes BETWEEN 0 AND 480",
            name="chk_shift_templates_break_duration",
        ),
        CheckConstraint(
            "working_hours BETWEEN 0.0 AND 24.0",
            name="chk_shift_templates_working_hours",
        ),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)

    # Shift times
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    # Attendance windows — define valid scan ranges for check-in and check-out
    checkin_window_start: Mapped[time] = mapped_column(Time, nullable=False)
    checkin_window_end: Mapped[time] = mapped_column(Time, nullable=False)
    checkout_window_start: Mapped[time] = mapped_column(Time, nullable=False)
    checkout_window_end: Mapped[time] = mapped_column(Time, nullable=False)

    # Grace and working time
    grace_period_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=15
    )
    late_threshold_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Extra minutes after grace where status is still 'present' but late_minutes is recorded. 0 = disabled."
    )
    break_duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    working_hours: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, default=Decimal("8.0")
    )

    # Overnight flag — critical for cross-midnight shift handling
    # When True: shift spans two calendar days; attendance attributed to start date
    is_overnight: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )

    # Phase 5: Shift classification and visual identity
    shift_type: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, default="day",
        comment="day, night, weekend, holiday, off"
    )
    color: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, default="#3B82F6",
        comment="Hex color for calendar/schedule display"
    )

    def __repr__(self) -> str:
        return (
            f"<ShiftTemplate(code='{self.code}', "
            f"{self.start_time}–{self.end_time}, "
            f"overnight={self.is_overnight})>"
        )
