"""
Project Z - Scan Events Feed API
GET /api/v1/scan-events        — paginated live scan feed
GET /api/v1/scan-events/{id}   — single scan event detail
"""
import datetime as dt
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import get_db
from app.models.scan_event import ScanEvent
from app.utils.time_utils import today_date

router = APIRouter(prefix="/scan-events", tags=["Scan Events"])


@router.get("")
async def list_scan_events(
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD (default: today)"),
    employee_id: Optional[UUID] = None,
    device_id: Optional[UUID] = None,
    department_id: Optional[UUID] = None,
    scan_result: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None, description="Pagination cursor (last scan_event id)"),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Get paginated scan events feed.
    Returns newest scans first (reverse chronological).
    """
    from datetime import timezone

    target_date = today_date() if not date else dt.date.fromisoformat(date)

    # Build date range filter
    day_start = dt.datetime.combine(target_date, dt.time.min).replace(tzinfo=timezone.utc)
    day_end = dt.datetime.combine(target_date, dt.time.max).replace(tzinfo=timezone.utc)

    filters = [
        ScanEvent.scan_timestamp >= day_start,
        ScanEvent.scan_timestamp <= day_end,
    ]

    if employee_id:
        filters.append(ScanEvent.employee_id == employee_id)
    if device_id:
        filters.append(ScanEvent.device_id == device_id)
    if department_id:
        filters.append(ScanEvent.department_id == department_id)
    if scan_result:
        filters.append(ScanEvent.scan_result == scan_result)

    # Cursor-based pagination using scan_timestamp
    if cursor:
        try:
            cursor_id = UUID(cursor)
            cursor_result = await db.execute(
                select(ScanEvent.scan_timestamp).where(ScanEvent.id == cursor_id)
            )
            cursor_ts = cursor_result.scalar_one_or_none()
            if cursor_ts:
                filters.append(ScanEvent.scan_timestamp < cursor_ts)
        except (ValueError, Exception):
            pass

    result = await db.execute(
        select(ScanEvent)
        .where(and_(*filters))
        .order_by(ScanEvent.scan_timestamp.desc())
        .limit(limit + 1)
    )
    scans = result.scalars().all()

    has_more = len(scans) > limit
    items = scans[:limit]
    next_cursor = str(items[-1].id) if has_more and items else None

    return {
        "items": [_serialize_scan(s) for s in items],
        "next_cursor": next_cursor,
        "total": len(items),
    }


@router.get("/{scan_id}")
async def get_scan_event(
    scan_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get a single scan event by ID (includes full raw_payload)."""
    result = await db.execute(
        select(ScanEvent).where(ScanEvent.id == scan_id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(404, "Scan event not found")
    return _serialize_scan(scan, include_raw=True)


def _serialize_scan(s: ScanEvent, include_raw: bool = False) -> dict:
    data = {
        "id": str(s.id),
        "employee_id": str(s.employee_id) if s.employee_id else None,
        "employee_code": s.employee_code,
        "employee_name": s.employee_name,
        "department_id": str(s.department_id) if s.department_id else None,
        "department_name": s.department_name,
        "office_id": str(s.office_id) if s.office_id else None,
        "office_name": s.office_name,
        "device_id": str(s.device_id) if s.device_id else None,
        "device_name": s.device_name,
        "device_serial": s.device_serial,
        "verification_method": s.verification_method.value if hasattr(s.verification_method, "value") else str(s.verification_method),
        "scan_result": s.scan_result.value if hasattr(s.scan_result, "value") else str(s.scan_result),
        "raw_punch_state": s.raw_punch_state,
        "scan_timestamp": s.scan_timestamp.isoformat(),
        "processing_status": s.processing_status.value if hasattr(s.processing_status, "value") else str(s.processing_status),
        "websocket_broadcasted": s.websocket_broadcasted,
        "created_at": s.created_at.isoformat(),
    }
    if include_raw:
        data["raw_payload"] = s.raw_payload
    return data
