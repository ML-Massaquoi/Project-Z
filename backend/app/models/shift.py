"""
Project Z - Shift Model
Work schedule definitions.
"""

from typing import Optional

from sqlalchemy import Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel

import datetime


class Shift(BaseModel):
    __tablename__ = "shifts"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    start_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    end_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    grace_period_minutes: Mapped[int] = mapped_column(Integer, default=15)
    break_duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    working_hours: Mapped[Optional[float]] = mapped_column(default=8.0)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    is_overnight: Mapped[bool] = mapped_column(default=False)

    def __repr__(self) -> str:
        return f"<Shift(name='{self.name}', {self.start_time}-{self.end_time})>"
