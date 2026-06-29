"""
Project Z - Backup Job Model
Tracks automated and manual PostgreSQL backup jobs.
"""

import enum
from datetime import datetime
from sqlalchemy import String, Text, Enum, DateTime, BigInteger, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class BackupStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class BackupType(str, enum.Enum):
    FULL = "full"
    SCHEMA_ONLY = "schema_only"
    DATA_ONLY = "data_only"


class BackupJob(BaseModel):
    """A single backup execution record."""

    __tablename__ = "backup_jobs"

    status: Mapped[BackupStatus] = mapped_column(
        Enum(BackupStatus), default=BackupStatus.PENDING, nullable=False, index=True
    )
    backup_type: Mapped[BackupType] = mapped_column(
        Enum(BackupType), default=BackupType.FULL, nullable=False
    )

    # File details
    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum_sha256: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Execution details
    database_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    init_by: Mapped[str] = mapped_column(String(256), default="scheduler", nullable=False)

    # Scheduling
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Extra metadata
    extra_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
