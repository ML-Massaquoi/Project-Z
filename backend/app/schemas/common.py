"""
Project Z - Common Schemas for Department, Shift, Office.
"""

from datetime import datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Department ──────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    head_name: Optional[str] = None
    office_id: Optional[UUID] = None
    shift_protocol_id: Optional[UUID] = None  # Required for proper attendance tracking


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    head_name: Optional[str] = None
    office_id: Optional[UUID] = None
    shift_protocol_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class DepartmentResponse(BaseModel):
    id: UUID
    name: str
    code: str
    description: Optional[str] = None
    head_name: Optional[str] = None
    office_id: UUID
    office_name: Optional[str] = None
    shift_protocol_id: Optional[UUID] = None
    shift_protocol_name: Optional[str] = None
    is_active: bool
    employee_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Shift ────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50)
    start_time: time
    end_time: time
    grace_period_minutes: int = 15
    late_threshold_minutes: int = 0
    break_duration_minutes: int = 60
    working_hours: float = 8.0
    description: Optional[str] = None
    is_overnight: bool = False


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    grace_period_minutes: Optional[int] = None
    late_threshold_minutes: Optional[int] = None
    break_duration_minutes: Optional[int] = None
    working_hours: Optional[float] = None
    description: Optional[str] = None
    is_overnight: Optional[bool] = None
    is_active: Optional[bool] = None


class ShiftResponse(BaseModel):
    id: UUID
    name: str
    code: str
    start_time: time
    end_time: time
    grace_period_minutes: int
    late_threshold_minutes: int
    break_duration_minutes: int
    working_hours: Optional[float] = None
    description: Optional[str] = None
    is_overnight: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Office ───────────────────────────────────────────────────

class OfficeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    organization_id: Optional[UUID] = None


class OfficeUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class OfficeResponse(BaseModel):
    id: UUID
    name: str
    code: str
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    organization_id: UUID
    is_active: bool
    department_count: int = 0
    device_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Report ───────────────────────────────────────────────────

class ReportRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    department_id: Optional[UUID] = None
    format: str = "excel"  # excel, pdf, csv
