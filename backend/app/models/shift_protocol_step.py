import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.shift_protocol import ShiftProtocol
    from app.models.shift_template import ShiftTemplate


class ShiftProtocolStep(BaseModel):
    __tablename__ = "shift_protocol_steps"

    protocol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="work",
        comment="work, off, holiday, leave"
    )
    label: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="Display label e.g. Day, Night, Off"
    )
    duration_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1,
        comment="How many consecutive days this step repeats"
    )

    protocol: Mapped["ShiftProtocol"] = relationship(
        "ShiftProtocol", back_populates="steps"
    )
    shift_template: Mapped[Optional["ShiftTemplate"]] = relationship(
        "ShiftTemplate", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<ShiftProtocolStep(order={self.step_order}, type='{self.step_type}', label='{self.label}')>"
