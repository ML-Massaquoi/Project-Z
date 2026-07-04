"""
Project Z - Rotation Group Models

For rotating departments, employees are divided into rotation groups.
Each group starts at a different offset in the protocol sequence,
ensuring continuous 24/7 coverage.

Relationship to ShiftPair:
  RotationGroup replaces the old 2-person ShiftPair model.
  Groups can hold N employees and use protocol offsets instead
  of slot-based Day/Night swapping.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class RotationGroup(BaseModel):
    """
    A rotation group within a department.

    Each group has a protocol_offset that determines where in the
    protocol cycle the group starts.  Groups cover each other so
    that day/night/off coverage is always balanced.

    Example:
      Protocol: [DAY, DAY, OFF, OFF, NIGHT, NIGHT, OFF, OFF]  (8-day cycle)

      Group A  offset=0  → DAY, DAY, OFF, OFF, NIGHT, NIGHT, OFF, OFF
      Group B  offset=4  → NIGHT, NIGHT, OFF, OFF, DAY, DAY, OFF, OFF
      Group C  offset=2  → OFF, OFF, NIGHT, NIGHT, OFF, OFF, DAY, DAY
      Group D  offset=6  → OFF, DAY, DAY, OFF, OFF, NIGHT, NIGHT, OFF
    """
    __tablename__ = "rotation_groups"
    __table_args__ = (
        UniqueConstraint("department_id", "name", name="uq_rotation_group_dept_name"),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="Human-readable name, e.g. 'Group A' or 'Team Alpha'",
    )
    protocol_offset: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Starting position (index) in the protocol sequence array",
    )
    color: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
        comment="Hex color for UI display",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # Relationships
    members: Mapped[list["GroupAssignment"]] = relationship(
        "GroupAssignment",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<RotationGroup(name='{self.name}', dept={self.department_id}, offset={self.protocol_offset})>"


class GroupAssignment(BaseModel):
    """
    Maps an employee to a rotation group.
    An employee belongs to exactly one active rotation group.
    """
    __tablename__ = "group_assignments"
    __table_args__ = (
        UniqueConstraint("employee_id", name="uq_group_assignment_employee"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rotation_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # Relationships
    group: Mapped["RotationGroup"] = relationship("RotationGroup", back_populates="members")

    def __repr__(self) -> str:
        return f"<GroupAssignment(emp={self.employee_id}, group={self.group_id})>"
