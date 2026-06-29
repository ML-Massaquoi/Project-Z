"""
Project Z - Backup Worker
Scheduled daily backup execution with retention enforcement.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.metrics import metrics
from app.models.backup import BackupType

logger = logging.getLogger(__name__)

settings = get_settings()


async def run_backup_worker(session_factory: async_sessionmaker) -> None:
    """
    Background worker that:
    1. Runs a full backup at the configured schedule (daily)
    2. Purges expired backups periodically
    3. Checks for backup failures and creates system alerts
    """
    logger.info("[BackupWorker] Starting...")

    last_backup_date = None

    while True:
        try:
            metrics.update_worker_heartbeat("backup_worker")
            now = datetime.now(timezone.utc)

            # Check if it's time for a scheduled backup
            if settings.BACKUP_ENABLED and _is_backup_time(now, last_backup_date):
                logger.info("[BackupWorker] Running scheduled backup...")
                async with session_factory() as session:
                    from app.services.backup_service import BackupService
                    from app.services.alert_service import create_system_alert
                    from app.models.system_alert import AlertSeverity

                    service = BackupService(session)
                    job = await service.trigger_backup(
                        backup_type=BackupType.FULL,
                        init_by="scheduler",
                    )

                    if job.status.value == "failed":
                        await create_system_alert(
                            session=session,
                            severity=AlertSeverity.CRITICAL,
                            title="Scheduled Backup Failed",
                            message=(
                                f"Automated backup failed: {job.error_message[:200] if job.error_message else 'Unknown error'}. "
                                f"Manual intervention may be required."
                            ),
                            source="backup_worker",
                            extra={
                                "job_id": str(job.id),
                                "error": job.error_message[:500] if job.error_message else None,
                            },
                        )
                        await session.commit()
                    else:
                        logger.info(f"[BackupWorker] Scheduled backup completed: {job.file_name}")

                    last_backup_date = now.date()

            # Purge expired backups every 6 hours
            if now.hour % 6 == 0 and now.minute < 5:
                async with session_factory() as session:
                    from app.services.backup_service import BackupService
                    service = BackupService(session)
                    purged = await service.purge_expired()
                    if purged > 0:
                        logger.info(f"[BackupWorker] Purged {purged} expired backup(s)")

        except asyncio.CancelledError:
            logger.info("[BackupWorker] Cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[BackupWorker] Error: {e}", exc_info=True)

        # Check every 60 seconds
        await asyncio.sleep(60)


def _is_backup_time(now: datetime, last_backup_date) -> bool:
    """Check if we should run the backup now."""
    if last_backup_date == now.date():
        return False

    target_hour = settings.BACKUP_SCHEDULE_HOUR
    target_minute = settings.BACKUP_SCHEDULE_MINUTE

    # Allow a 5-minute window
    if now.hour == target_hour and target_minute <= now.minute <= target_minute + 5:
        return True

    return False
