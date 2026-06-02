"""
Project Z - LeaveRequest Model
Employee leave requests with approval workflow.
Approved leave overrides attendance status computation (on_leave / vacation).
"""
import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class LeaveType(str, enum.Enum):
    ANNUAL = "annual"
    SICK = "sick"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    UNPAID = "unpaid"
    EMERGENCY = "emergency"


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LeaveRequest(BaseModel):
    __tablename__ = "leave_requests"
    __table_args__ = (
        CheckConstraint(
            "end_date >= start_date",
            name="chk_leave_requests_date_range",
        ),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type: Mapped[LeaveType] = mapped_column(
        SAEnum(
            LeaveType,
            name="leave_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[LeaveStatus] = mapped_column(
        SAEnum(
            LeaveStatus,
            name="leave_status",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=LeaveStatus.PENDING,
        index=True,
    )
    approver_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def covers_date(self, target_date: date) -> bool:
        """Check if this leave request covers the given date (inclusive)."""
        return self.start_date <= target_date <= self.end_date

    @property
    def is_approved(self) -> bool:
        return self.status == LeaveStatus.APPROVED

    @property
    def is_vacation(self) -> bool:
        """Annual leave maps to 'vacation' status in attendance computation."""
        return self.leave_type == LeaveType.ANNUAL

    def __repr__(self) -> str:
        return (
            f"<LeaveRequest(employee={self.employee_id}, "
            f"type={self.leave_type}, "
            f"{self.start_date}–{self.end_date}, "
            f"status={self.status})>"
        )
