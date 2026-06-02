"""
Project Z - DepartmentShiftRule Model
Assigns a ShiftTemplate to a department with effective date range and weekend rules.

The EXCLUDE USING gist constraint (non-overlapping date ranges per department)
is enforced at the database level — see migration 0002_enterprise_platform_schema.py.
"""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class DepartmentShiftRule(BaseModel):
    __tablename__ = "department_shift_rules"
    __table_args__ = (
        CheckConstraint(
            "grace_period_override IS NULL OR grace_period_override BETWEEN 0 AND 120",
            name="chk_dept_shift_rules_grace_override",
        ),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    # NULL = open-ended (no expiry)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # ISO weekday numbers: 1=Mon, 7=Sun. Empty array = no weekend days configured.
    weekend_days: Mapped[list] = mapped_column(
        ARRAY(Integer), nullable=False, default=list
    )

    # Override the shift template's default grace period for this department
    grace_period_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
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

    def is_effective_on(self, target_date: date) -> bool:
        """Check if this rule is effective on the given date."""
        if target_date < self.effective_from:
            return False
        if self.effective_to is not None and target_date > self.effective_to:
            return False
        return True

    def is_weekend(self, target_date: date) -> bool:
        """Check if the given date falls on a configured weekend day."""
        # isoweekday(): 1=Mon, 7=Sun
        return target_date.isoweekday() in (self.weekend_days or [])

    def __repr__(self) -> str:
        return (
            f"<DepartmentShiftRule(dept={self.department_id}, "
            f"from={self.effective_from}, to={self.effective_to})>"
        )
