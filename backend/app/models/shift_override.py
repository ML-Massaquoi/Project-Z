"""
Project Z - EmployeeShiftOverride Model
Time-bounded override that temporarily replaces an employee's shift assignment.
Highest precedence in the 4-level shift resolution chain.
"""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class EmployeeShiftOverride(BaseModel):
    __tablename__ = "employee_shift_overrides"
    __table_args__ = (
        CheckConstraint(
            "end_date >= start_date",
            name="chk_shift_overrides_date_range",
        ),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    shift_template: Mapped["ShiftTemplate"] = relationship(  # noqa: F821
        "ShiftTemplate", lazy="select"
    )

    def is_active_on(self, target_date: date) -> bool:
        """Check if this override is active on the given date (inclusive)."""
        return self.start_date <= target_date <= self.end_date

    def __repr__(self) -> str:
        return (
            f"<EmployeeShiftOverride(employee={self.employee_id}, "
            f"{self.start_date}–{self.end_date})>"
        )
