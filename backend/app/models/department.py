"""
Project Z - Department Model
Organizational departments within offices.
"""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee
    from app.models.office import Office
    from app.models.shift_protocol import ShiftProtocol


class Department(BaseModel):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    head_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    # Foreign Keys
    office_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("offices.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Shift Protocol - determines work schedule for this department
    shift_protocol_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_protocols.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    office: Mapped["Office"] = relationship("Office", back_populates="departments")
    employees: Mapped[list["Employee"]] = relationship(
        "Employee", back_populates="department"
    )
    devices: Mapped[list["Device"]] = relationship(
        "Device", back_populates="department"
    )
    shift_protocol: Mapped[Optional["ShiftProtocol"]] = relationship(
        "ShiftProtocol", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Department(name='{self.name}')>"
