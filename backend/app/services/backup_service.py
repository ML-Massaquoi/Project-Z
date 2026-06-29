"""
Project Z - Backup Service
Orchestrates PostgreSQL backups via pg_dump subprocess calls.
Handles backup creation, verification, expiry, and file management.
"""

import asyncio
import hashlib
import logging
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.backup import BackupJob, BackupStatus, BackupType

logger = logging.getLogger("projectz.backup")

settings = get_settings()

# File size thresholds
KB = 1024
MB = 1024 * KB
GB = 1024 * MB


def _format_size(size_bytes: int) -> str:
    if size_bytes < KB:
        return f"{size_bytes} B"
    if size_bytes < MB:
        return f"{size_bytes / KB:.1f} KB"
    if size_bytes < GB:
        return f"{size_bytes / MB:.1f} MB"
    return f"{size_bytes / GB:.1f} GB"


class BackupService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.backup_dir = Path(settings.BACKUP_DIR)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    async def trigger_backup(
        self,
        backup_type: BackupType = BackupType.FULL,
        init_by: str = "admin",
        retention_days: int | None = None,
    ) -> BackupJob:
        """Create and execute a new backup job."""
        now = datetime.now(timezone.utc)
        db_name = self._extract_db_name()

        job = BackupJob(
            status=BackupStatus.RUNNING,
            backup_type=backup_type,
            database_name=db_name,
            started_at=now,
            init_by=init_by,
            expires_at=now + timedelta(days=retention_days or settings.BACKUP_RETENTION_DAYS),
        )
        self.session.add(job)
        await self.session.flush()

        file_timestamp = now.strftime("%Y%m%d_%H%M%S")
        file_name = f"{db_name}_{backup_type.value}_{file_timestamp}.sql.gz"
        file_path = self.backup_dir / file_name
        job.file_name = file_name
        job.file_path = str(file_path)

        try:
            cmd = self._build_pg_dump_command(backup_type, str(file_path))
            logger.info(f"Running backup: {' '.join(cmd)}")

            start = time.monotonic()
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
                timeout=3600,  # 1 hour max
            )
            elapsed = int(time.monotonic() - start)

            if result.returncode != 0:
                raise RuntimeError(f"pg_dump failed (exit {result.returncode}): {result.stderr[:500]}")

            if not file_path.exists():
                raise RuntimeError("Backup file was not created")

            file_size = file_path.stat().st_size
            checksum = await self._compute_checksum(file_path)

            job.status = BackupStatus.COMPLETED
            job.file_size_bytes = file_size
            job.checksum_sha256 = checksum
            job.duration_seconds = elapsed
            job.completed_at = datetime.now(timezone.utc)

            logger.info(
                f"Backup completed: {file_name} ({_format_size(file_size)}, "
                f"{elapsed}s, checksum: {checksum[:12]}...)"
            )
        except Exception as e:
            job.status = BackupStatus.FAILED
            job.error_message = str(e)[:2000]
            job.completed_at = datetime.now(timezone.utc)
            logger.error(f"Backup failed: {e}", exc_info=True)

        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def list_backups(
        self,
        page: int = 1,
        page_size: int = 20,
        status: BackupStatus | None = None,
        backup_type: BackupType | None = None,
    ) -> tuple[list[BackupJob], int]:
        """List backup jobs with pagination and filters."""
        query = select(BackupJob).order_by(BackupJob.created_at.desc())
        count_query = select(func.count(BackupJob.id))

        if status:
            query = query.where(BackupJob.status == status)
            count_query = count_query.where(BackupJob.status == status)
        if backup_type:
            query = query.where(BackupJob.backup_type == backup_type)
            count_query = count_query.where(BackupJob.backup_type == backup_type)

        total = (await self.session.execute(count_query)).scalar_one()
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.session.execute(query)

        return list(result.scalars().all()), total

    async def get_stats(self) -> dict:
        """Get backup statistics."""
        total = (await self.session.execute(
            select(func.count(BackupJob.id))
        )).scalar_one()

        successful = (await self.session.execute(
            select(func.count(BackupJob.id)).where(BackupJob.status == BackupStatus.COMPLETED)
        )).scalar_one()

        failed = (await self.session.execute(
            select(func.count(BackupJob.id)).where(BackupJob.status == BackupStatus.FAILED)
        )).scalar_one()

        total_size = (await self.session.execute(
            select(func.coalesce(func.sum(BackupJob.file_size_bytes), 0))
            .where(BackupJob.status == BackupStatus.COMPLETED)
        )).scalar_one()

        avg_duration = (await self.session.execute(
            select(func.avg(BackupJob.duration_seconds))
            .where(BackupJob.status == BackupStatus.COMPLETED)
        )).scalar_one()

        last = (await self.session.execute(
            select(BackupJob)
            .where(BackupJob.status == BackupStatus.COMPLETED)
            .order_by(BackupJob.completed_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        next_scheduled = self._compute_next_scheduled()

        return {
            "total_backups": total,
            "successful_backups": successful,
            "failed_backups": failed,
            "total_size_bytes": total_size,
            "total_size_display": _format_size(total_size),
            "last_backup_at": last.completed_at if last else None,
            "last_backup_status": last.status if last else None,
            "avg_duration_seconds": round(avg_duration, 1) if avg_duration else None,
            "next_scheduled": next_scheduled,
            "storage_path": str(self.backup_dir),
        }

    async def delete_backup(self, job_id: str) -> bool:
        """Delete a backup job and its file."""
        job = (await self.session.execute(
            select(BackupJob).where(BackupJob.id == job_id)
        )).scalar_one_or_none()

        if not job:
            return False

        # Delete file if exists
        if job.file_path:
            path = Path(job.file_path)
            if path.exists():
                path.unlink()
                logger.info(f"Deleted backup file: {job.file_name}")

        await self.session.delete(job)
        await self.session.commit()
        return True

    async def purge_expired(self) -> int:
        """Remove expired backup jobs and their files."""
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            select(BackupJob).where(
                and_(
                    BackupJob.expires_at.isnot(None),
                    BackupJob.expires_at < now,
                    BackupJob.status.in_([BackupStatus.COMPLETED.value, BackupStatus.FAILED.value]),
                )
            )
        )
        expired = result.scalars().all()

        count = 0
        for job in expired:
            if job.file_path:
                path = Path(job.file_path)
                if path.exists():
                    path.unlink()
            await self.session.delete(job)
            count += 1

        if count > 0:
            await self.session.commit()
            logger.info(f"Purged {count} expired backup(s)")

        return count

    async def get_backup_by_id(self, job_id: str) -> BackupJob | None:
        result = await self.session.execute(
            select(BackupJob).where(BackupJob.id == job_id)
        )
        return result.scalar_one_or_none()

    def _build_pg_dump_command(self, backup_type: BackupType, output_path: str) -> list[str]:
        """Build the pg_dump command."""
        db_url = settings.DATABASE_URL_SYNC
        match = re.match(
            r"postgresql(?:\+\w+)?://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)",
            db_url,
        )
        if not match:
            raise ValueError(f"Cannot parse DATABASE_URL_SYNC: {db_url[:30]}...")

        user, password, host, port, dbname = match.groups()

        cmd = [
            settings.PG_DUMP_PATH,
            f"--host={host}",
            f"--port={port}",
            f"--username={user}",
            f"--dbname={dbname}",
            "--format=custom",
            "--compress=9",
            f"--file={output_path}",
        ]

        if backup_type == BackupType.SCHEMA_ONLY:
            cmd.append("--schema-only")
        elif backup_type == BackupType.DATA_ONLY:
            cmd.append("--data-only")

        # Set password via environment variable
        return cmd

    def _extract_db_name(self) -> str:
        match = re.search(r"/([^/?]+)(?:\?.*)?$", settings.DATABASE_URL)
        return match.group(1) if match else "projectz"

    @staticmethod
    async def _compute_checksum(file_path: Path) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _compute_next_scheduled() -> datetime | None:
        if not settings.BACKUP_ENABLED:
            return None
        now = datetime.now(timezone.utc)
        today = now.replace(
            hour=settings.BACKUP_SCHEDULE_HOUR,
            minute=settings.BACKUP_SCHEDULE_MINUTE,
            second=0, microsecond=0,
        )
        if today <= now:
            today += timedelta(days=1)
        return today
