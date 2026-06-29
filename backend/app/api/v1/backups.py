"""
Project Z - Backup API
Endpoints for managing PostgreSQL backups: trigger, list, stats, delete.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db, PermissionChecker
from app.models.backup import BackupStatus, BackupType
from app.schemas.backup import (
    BackupTriggerRequest,
    BackupJobResponse,
    BackupStatsResponse,
    BackupListResponse,
)
from app.services.backup_service import BackupService

router = APIRouter(prefix="/backups", tags=["Backups"])


@router.get(
    "",
    response_model=BackupListResponse,
    dependencies=[Depends(PermissionChecker("settings:view"))],
)
async def list_backups(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: BackupStatus | None = None,
    backup_type: BackupType | None = None,
    db: AsyncSession = Depends(get_db),
):
    service = BackupService(db)
    items, total = await service.list_backups(page, page_size, status, backup_type)
    return BackupListResponse(
        items=[
            BackupJobResponse(
                id=str(item.id),
                status=item.status,
                backup_type=item.backup_type,
                file_name=item.file_name,
                file_size_bytes=item.file_size_bytes,
                file_size_display=item.file_size_display_prop if hasattr(item, "file_size_display_prop") else None,
                checksum_sha256=item.checksum_sha256,
                database_name=item.database_name,
                duration_seconds=item.duration_seconds,
                duration_display=item.duration_display_prop if hasattr(item, "duration_display_prop") else None,
                error_message=item.error_message,
                init_by=item.init_by,
                scheduled_at=item.scheduled_at,
                started_at=item.started_at,
                completed_at=item.completed_at,
                expires_at=item.expires_at,
                created_at=item.created_at,
            )
            for item in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/stats",
    response_model=BackupStatsResponse,
    dependencies=[Depends(PermissionChecker("settings:view"))],
)
async def get_backup_stats(db: AsyncSession = Depends(get_db)):
    service = BackupService(db)
    stats = await service.get_stats()
    return BackupStatsResponse(**stats)


@router.post(
    "/trigger",
    response_model=BackupJobResponse,
    dependencies=[Depends(PermissionChecker("settings:manage"))],
)
async def trigger_backup(
    body: BackupTriggerRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    service = BackupService(db)
    job = await service.trigger_backup(
        backup_type=body.backup_type,
        init_by=current_user.username,
        retention_days=body.retention_days,
    )
    return BackupJobResponse(
        id=str(job.id),
        status=job.status,
        backup_type=job.backup_type,
        file_name=job.file_name,
        file_size_bytes=job.file_size_bytes,
        checksum_sha256=job.checksum_sha256,
        database_name=job.database_name,
        duration_seconds=job.duration_seconds,
        error_message=job.error_message,
        init_by=job.init_by,
        started_at=job.started_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
        created_at=job.created_at,
    )


@router.get(
    "/{job_id}",
    response_model=BackupJobResponse,
    dependencies=[Depends(PermissionChecker("settings:view"))],
)
async def get_backup(job_id: str, db: AsyncSession = Depends(get_db)):
    service = BackupService(db)
    job = await service.get_backup_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Backup not found")
    return BackupJobResponse(
        id=str(job.id),
        status=job.status,
        backup_type=job.backup_type,
        file_name=job.file_name,
        file_size_bytes=job.file_size_bytes,
        checksum_sha256=job.checksum_sha256,
        database_name=job.database_name,
        duration_seconds=job.duration_seconds,
        error_message=job.error_message,
        init_by=job.init_by,
        started_at=job.started_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
        created_at=job.created_at,
    )


@router.delete(
    "/{job_id}",
    status_code=204,
    dependencies=[Depends(PermissionChecker("settings:manage"))],
)
async def delete_backup(job_id: str, db: AsyncSession = Depends(get_db)):
    service = BackupService(db)
    deleted = await service.delete_backup(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Backup not found")
