"""
Project Z - Shift Pair Models
Supports the 2-On/2-Off Rotational Pairing System for FIA.

A ShiftPair groups exactly 2 employees who alternate Day/Night shifts.
Pairs belong to a department and reference a rotating ShiftProtocol.

Pair rotation logic:
  - Pair works 2 days ON (member[0]=DAY, member[1]=NIGHT)
  - Pair rests 2 days OFF
  - On return, roles SWAP (member[0]=NIGHT, member[1]=DAY)
  - Cycle repeats forever from a reference start_date
"""
import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class ShiftPair(BaseModel):
    """
    A named pair of employees assigned to a rotating shift protocol.

    Example:
        Pair A  →  Moses (slot 0), John (slot 1)
        Pair B  →  Patrick (slot 0), Abu (slot 1)

    slot 0 = starts as DAY shift when the pair is first ON
    slot 1 = starts as NIGHT shift when the pair is first ON
    After each 2-off rest, the slots swap.
    """
    __tablename__ = "shift_pairs"
    __table_args__ = (
        UniqueConstraint("department_id", "name", name="uq_shift_pair_dept_name"),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    protocol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_protocols.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="Human-readable name, e.g. 'Pair A'"
    )
    # Reference date: the first day the pair starts work (slot 0 = DAY)
    rotation_start_date: Mapped[date] = mapped_column(
        Date, nullable=False,
        comment="Day 0 of the rotation cycle for this pair"
    )
    color: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
        comment="Hex color for calendar display"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    members: Mapped[list["ShiftPairMember"]] = relationship(
        "ShiftPairMember",
        back_populates="pair",
        cascade="all, delete-orphan",
        order_by="ShiftPairMember.slot_index",
    )

    def __repr__(self) -> str:
        return f"<ShiftPair(name='{self.name}', dept={self.department_id})>"


class ShiftPairMember(BaseModel):
    """
    One member slot within a ShiftPair.

    slot_index:
      0 = starts as DAY when pair is first ON
      1 = starts as NIGHT when pair is first ON
      (roles swap after each 2-day rest)
    """
    __tablename__ = "shift_pair_members"
    __table_args__ = (
        UniqueConstraint("pair_id", "slot_index", name="uq_pair_member_slot"),
        UniqueConstraint("pair_id", "employee_id", name="uq_pair_member_employee"),
        CheckConstraint("slot_index IN (0, 1)", name="chk_pair_member_slot_range"),
    )

    pair_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_pairs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slot_index: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="0=first DAY slot, 1=first NIGHT slot"
    )

    # Relationships
    pair: Mapped["ShiftPair"] = relationship("ShiftPair", back_populates="members")

    def __repr__(self) -> str:
        return f"<ShiftPairMember(pair={self.pair_id}, employee={self.employee_id}, slot={self.slot_index})>"
