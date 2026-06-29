"""
Project Z - Employee Schemas
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class EmployeeCreate(BaseModel):
    employee_code: str = Field(..., min_length=1, max_length=50)
    employee_number: Optional[str] = Field(None, max_length=50, description="Official employee number (e.g. FIA0597)")
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    gender: Optional[str] = Field(None, pattern="^(male|female|other|prefer_not_to_say)$")
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[str] = Field("full_time", pattern="^(full_time|part_time|contract|intern|consultant|temporary)$")
    date_joined: Optional[date] = None
    department_id: Optional[UUID] = None
    shift_id: Optional[UUID] = None
    shift_protocol_id: Optional[UUID] = None
    status: str = "pending_enrollment"


class EmployeeUpdate(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=50)
    employee_number: Optional[str] = Field(None, max_length=50)
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    full_name: Optional[str] = Field(None, max_length=255)
    gender: Optional[str] = Field(None, pattern="^(male|female|other|prefer_not_to_say)$")
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[str] = Field(None, pattern="^(full_time|part_time|contract|intern|consultant|temporary)$")
    date_joined: Optional[date] = None
    department_id: Optional[UUID] = None
    shift_id: Optional[UUID] = None
    shift_protocol_id: Optional[UUID] = None
    avatar_url: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: UUID
    employee_code: str
    employee_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    full_name: str
    gender: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    employment_type: Optional[str] = None
    date_joined: Optional[date] = None
    status: str
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    shift_id: Optional[UUID] = None
    shift_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListResponse(BaseModel):
    items: list[EmployeeResponse]
    total: int
    page: int
    per_page: int
    pages: int
