"""
Project Z - Alert Schemas
Pydantic v2 request/response models for system alerts.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.system_alert import AlertSeverity, AlertCategory


class AlertCreate(BaseModel):
    """Internal schema for creating alerts programmatically."""
    severity: AlertSeverity
    category: AlertCategory
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    source: Optional[str] = None
    source_id: Optional[str] = None
    event_type: Optional[str] = None
    metadata: Optional[dict] = None
    expires_in_minutes: Optional[int] = None


class AlertResponse(BaseModel):
    """API response for a single alert."""
    id: UUID
    severity: AlertSeverity
    category: AlertCategory
    title: str
    message: str
    source: Optional[str] = None
    source_id: Optional[str] = None
    event_type: Optional[str] = None
    acknowledged: bool
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    metadata: Optional[dict] = None
    resolution_note: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    """Paginated alert list."""
    items: list[AlertResponse]
    total: int
    active_count: int
    page: int
    page_size: int


class AlertAcknowledgeRequest(BaseModel):
    """Request to acknowledge an alert."""
    resolution_note: Optional[str] = None


class AlertStatsResponse(BaseModel):
    """Alert statistics."""
    active_by_severity: dict[str, int]
    total_active: int
    acknowledged_today: int
    created_today: int
