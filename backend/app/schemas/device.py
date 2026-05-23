"""
Project Z - Device Schemas
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DeviceResponse(BaseModel):
    id: UUID
    serial_number: str
    name: Optional[str] = None
    ip_address: Optional[str] = None
    model: Optional[str] = None
    platform: str = "ZMM220_TFT"
    is_online: bool = False
    is_active: bool = True
    last_seen: Optional[datetime] = None
    last_activity: Optional[str] = None
    office_id: Optional[UUID] = None
    office_name: Optional[str] = None
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    office_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    location_description: Optional[str] = None


class DeviceListResponse(BaseModel):
    items: list[DeviceResponse]
    total: int
