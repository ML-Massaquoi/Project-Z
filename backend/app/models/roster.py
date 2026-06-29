"""
Project Z - Roster Models
Monthly shift roster for FIA workforce scheduling.

RosterSnapshot  — one record per (department, year, month) generation
RosterEntry     — one record per (employee, date) assignment
"""
import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class AssignmentType(str, enum.Enum):
    DAY     = "DAY"     # 08:00–20:00 (or protocol day_shift hours)
    NIGHT   = "NIGHT"   # 20:00–08:00 (or protocol night_shift hours)
    OFF     = "OFF"     # Scheduled rest day
    LEAVE   = "LEAVE"   # Approved leave (overrides rotation)
    ABSENT  = "ABSENT"  # Was scheduled but did not scan (computed retrospectively)
    HOLIDAY = "HOLIDAY" # Public/org holiday
    ADMIN   = "ADMIN"   # Standard office day (08:00–17:00)


class RosterSnapshot(BaseModel):
    """
    Header record for one generated monthly roster.
    One per (department, year, month).
    Regenerating replaces the existing snapshot and its entries.
    """
    __tablename__ = "roster_snapshots"
    __table_args__ = (
        UniqueConstraint("department_id", "year", "month", name="uq_roster_snapshot_dept_ym"),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_name: Mapped[str] = mapped_column(String(255), nullable=False)
    year:  Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–12

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    generated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    entries: Mapped[list["RosterEntry"]] = relationship(
        "RosterEntry",
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<RosterSnapshot(dept={self.department_id}, {self.year}-{self.month:02d})>"


class RosterEntry(BaseModel):
    """
    One day's assignment for one employee.
    """
    __tablename__ = "roster_entries"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_id", "employee_id", "entry_date",
            name="uq_roster_entry_snap_emp_date"
        ),
    )

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roster_snapshots.id", ondelete="CASCADE"),
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

    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    assignment: Mapped[AssignmentType] = mapped_column(
        SAEnum(AssignmentType, name="roster_assignment_type",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )

    # Which pair this employee belongs to (null for admin/unpaired staff)
    pair_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_pairs.id", ondelete="SET NULL"),
        nullable=True,
    )
    pair_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Shift times (denormalized for fast display, copied from protocol)
    shift_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # HH:MM
    shift_end:   Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # HH:MM

    # Override flag — admin manually changed this entry
    is_overridden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    override_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    snapshot: Mapped["RosterSnapshot"] = relationship("RosterSnapshot", back_populates="entries")

    def __repr__(self) -> str:
        return f"<RosterEntry(emp={self.employee_code}, date={self.entry_date}, assign={self.assignment})>"
