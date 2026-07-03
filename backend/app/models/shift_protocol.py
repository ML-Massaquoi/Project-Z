"""
Project Z - Shift Protocol Model
Defines work rotation patterns for departments.

Protocol Types:
  - fixed: Standard weekly schedule (e.g., Mon-Fri, 8am-5pm)
  - rotating: Rotating pattern (e.g., 2 days on, 2 days off with day/night swap)

The protocol is assigned to departments and determines:
  - Which days employees work
  - What shift times apply (day/night)
  - Rest days
  - Weekend work rules
"""

import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.shift_protocol_step import ShiftProtocolStep


class ProtocolType(str, enum.Enum):
    FIXED = "fixed"           # Standard weekly schedule
    ROTATING = "rotating"     # Rotating pattern (2-on-2-off, etc.)
    CUSTOM = "custom"         # Custom pattern


class ShiftProtocol(BaseModel):
    """
    Defines a work rotation pattern.
    
    Examples:
      1. HR (Fixed Weekly):
         - protocol_type: fixed
         - working_days: [1,2,3,4,5] (Mon-Fri)
         - working_hours: 8am-5pm
         - include_weekends: false
      
      2. IT (Rotating 2-on-2-off):
         - protocol_type: rotating
         - days_on: 2
         - days_off: 2
         - rotation_shifts: ["day", "day", "off", "off", "night", "night", "off", "off"]
         - day_shift: {start: "08:00", end: "20:00"}
         - night_shift: {start: "20:00", end: "08:00"}
      
      3. Boss (Fixed Custom):
         - protocol_type: fixed
         - working_days: [1,2,3,4,5] (Mon-Fri)
         - working_hours: 8:30am-5pm
         - include_weekends: false
    """
    __tablename__ = "shift_protocols"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Protocol Type
    protocol_type: Mapped[ProtocolType] = mapped_column(
        SAEnum(ProtocolType, name="protocol_type", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ProtocolType.FIXED,
    )
    
    # Fixed Schedule Settings
    # Working days: 1=Monday, 7=Sunday (ISO weekday)
    working_days: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="ISO weekday numbers for fixed schedules (1=Mon, 7=Sun)"
    )
    
    # Working hours for fixed schedules
    working_hours_start: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="Start time HH:MM for fixed schedules"
    )
    working_hours_end: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="End time HH:MM for fixed schedules"
    )
    
    # Rotating Schedule Settings
    days_on: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Consecutive work days for rotating schedules"
    )
    days_off: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Consecutive rest days for rotating schedules"
    )
    
    # Rotation pattern: array of shift types in order
    # Example: ["day", "day", "off", "off", "night", "night", "off", "off"]
    rotation_shifts: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, default=list,
        comment="Ordered array of shift types in rotation cycle"
    )
    
    # Shift time definitions for rotating schedules
    day_shift_start: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="Day shift start time HH:MM"
    )
    day_shift_end: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="Day shift end time HH:MM"
    )
    night_shift_start: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="Night shift start time HH:MM"
    )
    night_shift_end: Mapped[Optional[str]] = mapped_column(
        String(5), nullable=True,
        comment="Night shift end time HH:MM"
    )
    
    # Common Settings
    grace_period_minutes: Mapped[int] = mapped_column(Integer, default=15)
    include_weekends: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Color for UI display
    color: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True,
        comment="Hex color for UI display"
    )

    # Cycle settings
    cycle_length: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None,
        comment="Total cycle length in days (auto-calculated from steps)"
    )
    default_shift_supervisor: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        comment="Default shift supervisor name or title"
    )

    # Relationships
    steps: Mapped[list["ShiftProtocolStep"]] = relationship(
        "ShiftProtocolStep", back_populates="protocol",
        order_by="ShiftProtocolStep.step_order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<ShiftProtocol(name='{self.name}', type='{self.protocol_type}')>"
