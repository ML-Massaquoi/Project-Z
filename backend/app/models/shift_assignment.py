"""
Project Z - EmployeeShiftAssignment Model
Assigns a ShiftTemplate (or rotating schedule) to an individual employee.
Overrides the department-level DepartmentShiftRule for this employee.

Supports two modes:
  - Simple: shift_template_id is set, rotation_templates is empty
  - Rotating: rotation_templates is a non-empty ordered list of template IDs,
              rotation_start_date defines day 0 of the cycle
"""
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class EmployeeShiftAssignment(BaseModel):
    __tablename__ = "employee_shift_assignments"
    __table_args__ = (
        CheckConstraint(
            "grace_period_override IS NULL OR grace_period_override BETWEEN 0 AND 120",
            name="chk_emp_shift_assignments_grace_override",
        ),
        CheckConstraint(
            "(shift_template_id IS NOT NULL AND array_length(rotation_templates, 1) IS NULL)"
            " OR "
            "(shift_template_id IS NULL AND array_length(rotation_templates, 1) >= 2)",
            name="chk_assignment_type",
        ),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Simple assignment ─────────────────────────────────────
    shift_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="RESTRICT"),
        nullable=True,
    )

    # ── Rotating assignment ───────────────────────────────────
    # Ordered list of shift_template UUIDs (2–30 entries)
    rotation_templates: Mapped[list] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    # Day 0 of the rotation cycle
    rotation_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Override the shift template's default grace period for this employee
    grace_period_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    shift_template: Mapped[Optional["ShiftTemplate"]] = relationship(  # noqa: F821
        "ShiftTemplate", lazy="select"
    )

    @property
    def is_rotating(self) -> bool:
        """True if this is a rotating shift assignment."""
        return bool(self.rotation_templates)

    def resolve_template_id_for_date(self, target_date: date) -> Optional[uuid.UUID]:
        """
        Resolve the active shift template ID for a given date.

        For simple assignments: returns shift_template_id directly.
        For rotating assignments: applies modulo arithmetic.
          index = (target_date - rotation_start_date).days % len(rotation_templates)
          Python's modulo handles negative values correctly.
        """
        if not self.is_rotating:
            return self.shift_template_id

        if not self.rotation_start_date:
            return None

        days_elapsed = (target_date - self.rotation_start_date).days
        index = days_elapsed % len(self.rotation_templates)
        return self.rotation_templates[index]

    def __repr__(self) -> str:
        if self.is_rotating:
            return (
                f"<EmployeeShiftAssignment(employee={self.employee_id}, "
                f"rotating={len(self.rotation_templates)} templates)>"
            )
        return (
            f"<EmployeeShiftAssignment(employee={self.employee_id}, "
            f"template={self.shift_template_id})>"
        )
