"""
Project Z - HolidayCalendar Model
Non-working dates that affect attendance status computation.
Scoped to organization-wide or a specific department.
"""
import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class HolidayType(str, enum.Enum):
    PUBLIC = "public"
    ORGANIZATIONAL = "organizational"
    DEPARTMENTAL = "departmental"


class HolidayScope(str, enum.Enum):
    ORGANIZATION = "organization"
    DEPARTMENT = "department"


class HolidayCalendar(BaseModel):
    __tablename__ = "holiday_calendar"
    __table_args__ = (
        CheckConstraint(
            "(scope = 'department' AND department_id IS NOT NULL)"
            " OR (scope = 'organization' AND department_id IS NULL)",
            name="chk_dept_scope",
        ),
    )

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    holiday_type: Mapped[HolidayType] = mapped_column(
        SAEnum(
            HolidayType,
            name="holiday_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=HolidayType.PUBLIC,
    )
    scope: Mapped[HolidayScope] = mapped_column(
        SAEnum(
            HolidayScope,
            name="holiday_scope",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=HolidayScope.ORGANIZATION,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<HolidayCalendar(date={self.date}, "
            f"name='{self.name}', scope={self.scope})>"
        )
