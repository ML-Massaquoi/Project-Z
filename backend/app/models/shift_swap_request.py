import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.shift_template import ShiftTemplate


class ShiftSwapRequest(BaseModel):
    __tablename__ = "shift_swap_requests"

    class SwapStatus:
        PENDING = "pending"
        APPROVED = "approved"
        REJECTED = "rejected"
        CANCELLED = "cancelled"

    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    swap_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    requester_shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    target_shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    reviewed_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    requester: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[requester_id], lazy="select"
    )
    target: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[target_id], lazy="select"
    )

    def __repr__(self) -> str:
        return f"<ShiftSwapRequest({self.requester_id}↔{self.target_id} on {self.swap_date}, {self.status})>"
