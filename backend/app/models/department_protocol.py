import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.shift_protocol import ShiftProtocol


class DepartmentProtocol(BaseModel):
    __tablename__ = "department_protocols"

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
    )
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True,
        comment="NULL = currently active, set when superseded"
    )
    default_supervisor: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    department: Mapped["Department"] = relationship("Department", lazy="select")
    protocol: Mapped["ShiftProtocol"] = relationship("ShiftProtocol", lazy="select")

    def __repr__(self) -> str:
        return f"<DepartmentProtocol(dept={self.department_id}, protocol={self.protocol_id}, since={self.effective_date})>"
