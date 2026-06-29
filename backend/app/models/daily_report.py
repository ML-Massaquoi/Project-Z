"""
Project Z - Daily Report Model
Stores generated daily attendance reports with per-employee lines.
Each report captures first scan = check-in, last scan = check-out.
"""

import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class DailyReport(BaseModel):
    """One row per department per date. Generated on demand or nightly."""

    __tablename__ = "daily_reports"
    __table_args__ = (
        UniqueConstraint("report_date", "department_id", name="uq_daily_report_dept_date"),
    )

    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Summary counts
    total_expected: Mapped[int] = mapped_column(Integer, default=0)
    total_present: Mapped[int] = mapped_column(Integer, default=0)
    total_late: Mapped[int] = mapped_column(Integer, default=0)
    total_absent: Mapped[int] = mapped_column(Integer, default=0)
    total_on_leave: Mapped[int] = mapped_column(Integer, default=0)
    total_overtime: Mapped[int] = mapped_column(Integer, default=0)
    total_early_departure: Mapped[int] = mapped_column(Integer, default=0)

    # Generation metadata
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    generated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    is_final: Mapped[bool] = mapped_column(default=False)

    # Relationships
    lines: Mapped[list["DailyReportLine"]] = relationship(
        "DailyReportLine", back_populates="report", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<DailyReport(date={self.report_date}, dept={self.department_name}, present={self.total_present}/{self.total_expected})>"


class DailyReportLine(BaseModel):
    """One row per employee in a daily report."""

    __tablename__ = "daily_report_lines"
    __table_args__ = (
        UniqueConstraint("report_id", "employee_id", name="uq_daily_report_line_emp"),
    )

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("daily_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_code: Mapped[str] = mapped_column(String(50), nullable=False)
    employee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Shift info
    shift_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shift_start: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    shift_end: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

    # Scan-derived times
    first_scan: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_scan: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_scans: Mapped[int] = mapped_column(Integer, default=0)

    # Computed fields
    check_in: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    check_out: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    late_minutes: Mapped[float] = mapped_column(Float, default=0)
    overtime_minutes: Mapped[float] = mapped_column(Float, default=0)
    early_departure_minutes: Mapped[float] = mapped_column(Float, default=0)
    duration_minutes: Mapped[float] = mapped_column(Float, default=0)

    # Status: on_time | late | absent | on_leave | off_duty | partial
    status: Mapped[str] = mapped_column(String(50), default="absent")

    # Device info
    check_in_device: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    check_out_device: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    report: Mapped["DailyReport"] = relationship("DailyReport", back_populates="lines")

    def __repr__(self) -> str:
        return f"<DailyReportLine(emp={self.employee_name}, status={self.status}, in={self.first_scan})>"
