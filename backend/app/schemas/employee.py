"""
Project Z - Employee Schemas
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class EmployeeCreate(BaseModel):
    employee_code: str = Field(..., min_length=1, max_length=50)
    full_name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=255)
    department_id: Optional[UUID] = None
    shift_id: Optional[UUID] = None
    status: str = "active"


class EmployeeUpdate(BaseModel):
    employee_code: Optional[str] = Field(None, max_length=50)
    full_name: Optional[str] = Field(None, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=255)
    department_id: Optional[UUID] = None
    shift_id: Optional[UUID] = None
    status: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    status: str
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    shift_id: Optional[UUID] = None
    shift_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListResponse(BaseModel):
    items: list[EmployeeResponse]
    total: int
    page: int
    per_page: int
    pages: int
