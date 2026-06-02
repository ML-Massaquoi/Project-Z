"""
Project Z - AttendanceSummary Model
Pre-computed per-department, per-date attendance snapshot.

Dashboard queries read from this table — never aggregate attendance_sessions directly.
Updated by SummaryService within 10 seconds of any Attendance_Session status change.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class AttendanceSummary(BaseModel):
    __tablename__ = "attendance_summaries"
    __table_args__ = (
        UniqueConstraint(
            "department_id",
            "summary_date",
            name="uq_attendance_summaries_dept_date",
        ),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    summary_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Attendance counts — all default to 0
    expected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    present_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    late_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    absent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    on_leave_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vacation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overtime_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Employees with check_in but no check_out within active shift window
    on_shift_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )

    def __repr__(self) -> str:
        return (
            f"<AttendanceSummary(dept={self.department_id}, "
            f"date={self.summary_date}, "
            f"present={self.present_count}/{self.expected_count})>"
        )
