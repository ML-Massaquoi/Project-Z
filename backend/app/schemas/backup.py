"""
Project Z - Backup Schemas
Pydantic models for backup request/response payloads.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.models.backup import BackupStatus, BackupType


class BackupJobResponse(BaseModel):
    id: str
    status: BackupStatus
    backup_type: BackupType
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_size_display: Optional[str] = None
    checksum_sha256: Optional[str] = None
    database_name: Optional[str] = None
    duration_seconds: Optional[int] = None
    duration_display: Optional[str] = None
    error_message: Optional[str] = None
    init_by: str
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @property
    def file_size_display_prop(self) -> str:
        if not self.file_size_bytes:
            return "N/A"
        size = self.file_size_bytes
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"

    @property
    def duration_display_prop(self) -> str:
        if self.duration_seconds is None:
            return "N/A"
        minutes, seconds = divmod(self.duration_seconds, 60)
        if minutes:
            return f"{minutes}m {seconds}s"
        return f"{seconds}s"


class BackupTriggerRequest(BaseModel):
    backup_type: BackupType = BackupType.FULL
    retention_days: Optional[int] = None


class BackupScheduleConfig(BaseModel):
    enabled: bool
    schedule_hour: int = 2  # 2 AM default
    schedule_minute: int = 0
    retention_days: int = 30
    backup_type: BackupType = BackupType.FULL


class BackupStatsResponse(BaseModel):
    total_backups: int
    successful_backups: int
    failed_backups: int
    total_size_bytes: int
    total_size_display: str
    last_backup_at: Optional[datetime] = None
    last_backup_status: Optional[BackupStatus] = None
    avg_duration_seconds: Optional[float] = None
    next_scheduled: Optional[datetime] = None
    storage_path: str


class BackupListResponse(BaseModel):
    items: list[BackupJobResponse]
    total: int
    page: int
    page_size: int
