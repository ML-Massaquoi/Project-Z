"""
Project Z - Employee Device Mapping Model
Maps device-local user IDs to centralized employees.
"""

import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class EmployeeDeviceMapping(BaseModel):
    """Maps a biometric device's local user ID to a centralized employee record."""

    __tablename__ = "employee_device_mappings"
    __table_args__ = (
        UniqueConstraint(
            "device_id", "device_user_id", name="uq_device_user"
        ),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_user_id: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="The user ID as stored on the biometric device"
    )

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="device_mappings"
    )
    device: Mapped["Device"] = relationship("Device")

    def __repr__(self) -> str:
        return f"<EmployeeDeviceMapping(employee={self.employee_id}, device_user={self.device_user_id})>"


# Also import for type checking
from app.models.employee import Employee  # noqa: E402
from app.models.device import Device  # noqa: E402
