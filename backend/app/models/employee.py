"""
Project Z - Employee Model
Centralized employee profiles with status lifecycle.
"""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum as SAEnum
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

import enum

if TYPE_CHECKING:
    from app.models.attendance import AttendanceLog, AttendanceSession
    from app.models.department import Department
    from app.models.employee_device_mapping import EmployeeDeviceMapping


class EmployeeStatus(str, enum.Enum):
    PENDING_ENROLLMENT = "pending_enrollment"
    ENROLLED = "enrolled"
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    TRANSFERRED = "transferred"
    TERMINATED = "terminated"
    RETIRED = "retired"


class EmploymentType(str, enum.Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERN = "intern"
    CONSULTANT = "consultant"
    TEMPORARY = "temporary"


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


# Valid state transitions: from_status -> set of allowed to_status values
STATUS_TRANSITIONS: dict[str, set[str]] = {
    EmployeeStatus.PENDING_ENROLLMENT.value: {
        EmployeeStatus.ENROLLED.value,
        EmployeeStatus.ACTIVE.value,
        EmployeeStatus.INACTIVE.value,
        EmployeeStatus.TERMINATED.value,
    },
    EmployeeStatus.ENROLLED.value: {
        EmployeeStatus.ACTIVE.value,
        EmployeeStatus.INACTIVE.value,
        EmployeeStatus.TERMINATED.value,
    },
    EmployeeStatus.ACTIVE.value: {
        EmployeeStatus.INACTIVE.value,
        EmployeeStatus.SUSPENDED.value,
        EmployeeStatus.TRANSFERRED.value,
        EmployeeStatus.TERMINATED.value,
        EmployeeStatus.RETIRED.value,
    },
    EmployeeStatus.INACTIVE.value: {
        EmployeeStatus.ACTIVE.value,
        EmployeeStatus.TERMINATED.value,
    },
    EmployeeStatus.SUSPENDED.value: {
        EmployeeStatus.ACTIVE.value,
        EmployeeStatus.TERMINATED.value,
    },
    EmployeeStatus.TRANSFERRED.value: {
        EmployeeStatus.ACTIVE.value,
        EmployeeStatus.TERMINATED.value,
    },
    EmployeeStatus.TERMINATED.value: set(),  # Terminal state
    EmployeeStatus.RETIRED.value: set(),  # Terminal state
}


def can_transition(current_status: str, new_status: str) -> bool:
    """Check if a status transition is valid."""
    allowed = STATUS_TRANSITIONS.get(current_status, set())
    return new_status in allowed


class Employee(BaseModel):
    __tablename__ = "employees"

    # Core identity
    employee_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    employee_number: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, nullable=True, index=True,
        comment="Official employee number (e.g. FIA0597)"
    )
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    middle_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Personal info
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Employment info
    position: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    employment_type: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True, default="full_time"
    )
    date_joined: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    termination_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Status
    status: Mapped[EmployeeStatus] = mapped_column(
        SAEnum(EmployeeStatus, name="employee_status", values_callable=lambda x: [e.value for e in x]),
        default=EmployeeStatus.ACTIVE,
        nullable=False,
    )
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status_changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Foreign Keys
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shifts.id", ondelete="SET NULL"),
        nullable=True,
    )
    shift_protocol_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_protocols.id", ondelete="SET NULL"),
        nullable=True,
        comment="Direct shift protocol assignment for this employee",
    )
    rotation_offset: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=0,
        comment="Position offset in the protocol rotation cycle. 0 = start from day 1."
    )

    # Relationships
    department: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="employees"
    )
    attendance_logs: Mapped[list["AttendanceLog"]] = relationship(
        "AttendanceLog", back_populates="employee"
    )
    attendance_sessions: Mapped[list["AttendanceSession"]] = relationship(
        "AttendanceSession", back_populates="employee"
    )
    device_mappings: Mapped[list["EmployeeDeviceMapping"]] = relationship(
        "EmployeeDeviceMapping", back_populates="employee", cascade="all, delete-orphan"
    )
    shift_protocol: Mapped[Optional["ShiftProtocol"]] = relationship(
        "ShiftProtocol", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Employee(code='{self.employee_code}', name='{self.full_name}')>"

    @property
    def display_name(self) -> str:
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.full_name

    def validate_status_transition(self, new_status: str) -> bool:
        return can_transition(self.status.value, new_status)
