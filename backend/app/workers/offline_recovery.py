"""
Project Z - Offline Recovery Worker
Re-enqueues scan_events that were stored when Redis was unavailable.

Polls every 60 seconds for records with processing_status = 'queued_offline'.
Runs as an asyncio background task inside the FastAPI lifespan.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60
BATCH_SIZE = 100


async def recover_offline_scans(redis, db_session_factory) -> None:
    """
    Single recovery pass: find queued_offline scans and re-enqueue them.
    """
    from sqlalchemy import and_, select, update
    from app.models.scan_event import ScanEvent, ProcessingStatusV2
    from app.services.stream_consumer import STREAM_NAME

    async with db_session_factory() as session:
        result = await session.execute(
            select(ScanEvent)
            .where(ScanEvent.processing_status == ProcessingStatusV2.QUEUED_OFFLINE)
            .order_by(ScanEvent.created_at.asc())
            .limit(BATCH_SIZE)
        )
        scans = result.scalars().all()

        if not scans:
            return

        logger.info(f"[OfflineRecovery] Found {len(scans)} queued_offline scan(s) to re-enqueue")

        for scan in scans:
            try:
                await redis.xadd(
                    STREAM_NAME,
                    {
                        "scan_event_id": str(scan.id),
                        "employee_id": str(scan.employee_id) if scan.employee_id else "",
                        "scan_timestamp": scan.scan_timestamp.isoformat(),
                        "attempt": "1",
                    },
                )
                await session.execute(
                    update(ScanEvent)
                    .where(
                        and_(
                            ScanEvent.id == scan.id,
                            ScanEvent.scan_timestamp == scan.scan_timestamp,
                        )
                    )
                    .values(processing_status=ProcessingStatusV2.QUEUED)
                )
                logger.debug(f"[OfflineRecovery] Re-enqueued scan {scan.id}")
            except Exception as e:
                logger.error(f"[OfflineRecovery] Failed to re-enqueue scan {scan.id}: {e}")

        await session.commit()
        logger.info(f"[OfflineRecovery] Re-enqueued {len(scans)} scan(s)")


async def run_offline_recovery(db_session_factory) -> None:
    """
    Background loop: runs recover_offline_scans every 60 seconds.
    """
    from app.core.config import get_settings
    import redis.asyncio as aioredis

    settings = get_settings()
    logger.info("[OfflineRecovery] Starting offline recovery task")

    while True:
        try:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                await recover_offline_scans(redis, db_session_factory)
            finally:
                await redis.aclose()
        except asyncio.CancelledError:
            logger.info("[OfflineRecovery] Offline recovery task cancelled")
            break
        except Exception as e:
            logger.error(f"[OfflineRecovery] Error: {e}", exc_info=True)
