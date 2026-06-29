"""
Device Group Model.

Groups devices by location, department, or function.
Supports enterprise-scale device organization (50+ devices).
"""

import uuid
from typing import Optional

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel


class DeviceGroup(BaseModel):
    """A logical grouping of biometric devices."""

    __tablename__ = "device_groups"

    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # hex color for UI
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # lucide icon name

    # Relationships
    devices: Mapped[list["Device"]] = relationship("Device", back_populates="device_group")

    def __repr__(self) -> str:
        return f"<DeviceGroup(name='{self.name}')>"
