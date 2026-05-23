"""
Project Z - Attendance Schemas
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class AttendanceLogResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    device_id: Optional[UUID] = None
    device_name: Optional[str] = None
    device_ip: Optional[str] = None
    timestamp: datetime
    verify_type: str
    punch_direction: str
    is_duplicate: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class AttendanceSessionResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    late_minutes: Optional[float] = None
    overtime_minutes: Optional[float] = None
    status: str
    is_complete: bool
    check_in_device_name: Optional[str] = None
    check_out_device_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AttendanceLiveResponse(BaseModel):
    items: list[AttendanceLogResponse]
    total: int


class AttendanceHistoryResponse(BaseModel):
    items: list[AttendanceSessionResponse]
    total: int
    page: int
    per_page: int
    pages: int
