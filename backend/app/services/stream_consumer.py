"""
Project Z - Redis Streams Consumer
Processes attendance tasks from the projectz:attendance_tasks stream.

Consumer group: attendance_processors
Worker ID: worker-{hostname}-{pid}

Exactly-once processing: XACK only after successful computation.
Retry up to 3 attempts; after 3 failures → failed_permanent + XACK.
"""
import asyncio
import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

STREAM_NAME = "projectz:attendance_tasks"
GROUP_NAME = "attendance_processors"
MAX_RETRIES = 3


async def ensure_consumer_group(redis: Any) -> None:
    """
    Create the consumer group if it doesn't exist.
    MKSTREAM creates the stream if it doesn't exist yet.
    BUSYGROUP error is expected on restart — silently ignored.
    """
    try:
        await redis.xgroup_create(
            name=STREAM_NAME,
            groupname=GROUP_NAME,
            id="0",       # Start from beginning of stream
            mkstream=True,
        )
        logger.info(f"[StreamConsumer] Created consumer group '{GROUP_NAME}' on '{STREAM_NAME}'")
    except Exception as e:
        if "BUSYGROUP" in str(e):
            logger.debug(f"[StreamConsumer] Consumer group already exists — OK")
        else:
            raise


async def consume_loop(
    worker_id: str,
    redis: Any,
    db_session_factory: Any,
) -> None:
    """
    Main consumer loop. Reads up to 10 messages per iteration,
    blocks for 2 seconds if the stream is empty.
    """
    logger.info(f"[StreamConsumer] Worker '{worker_id}' starting consume loop")
    while True:
        try:
            messages = await redis.xreadgroup(
                groupname=GROUP_NAME,
                consumername=worker_id,
                streams={STREAM_NAME: ">"},
                count=10,
                block=2000,
            )
            if not messages:
                continue

            for _stream_name, entries in messages:
                for entry_id, fields in entries:
                    await _process_with_retry(
                        entry_id=entry_id,
                        fields=fields,
                        redis=redis,
                        db_session_factory=db_session_factory,
                    )

        except asyncio.CancelledError:
            logger.info(f"[StreamConsumer] Worker '{worker_id}' cancelled")
            break
        except Exception as e:
            logger.error(f"[StreamConsumer] Consume loop error: {e}", exc_info=True)
            await asyncio.sleep(5)  # Back off before retrying


async def _process_with_retry(
    entry_id: str,
    fields: dict,
    redis: Any,
    db_session_factory: Any,
) -> None:
    """
    Process a single stream entry with retry logic.

    Success: XACK the message.
    Failure (attempt < MAX_RETRIES): re-enqueue with incremented attempt, XACK original.
    Failure (attempt >= MAX_RETRIES): mark failed_permanent, XACK.
    """
    scan_event_id_str = fields.get("scan_event_id", "")
    attempt = int(fields.get("attempt", "1"))

    if not scan_event_id_str:
        logger.warning(f"[StreamConsumer] Entry {entry_id} missing scan_event_id — skipping")
        await redis.xack(STREAM_NAME, GROUP_NAME, entry_id)
        return

    try:
        scan_event_id = UUID(scan_event_id_str)
    except ValueError:
        logger.warning(f"[StreamConsumer] Invalid scan_event_id '{scan_event_id_str}' — skipping")
        await redis.xack(STREAM_NAME, GROUP_NAME, entry_id)
        return

    # ── Grace delay on first attempt only ──────────────────────────
    # The ingestion service enqueues to Redis immediately after session.flush()
    # but BEFORE session.commit(). The scan_event row may not yet be visible
    # to this worker's independent DB session. A 150ms wait covers >99% of cases.
    if attempt == 1:
        await asyncio.sleep(0.15)

    try:
        async with db_session_factory() as session:
            from app.services.attendance_engine_v2 import AttendanceEngineV2
            engine = AttendanceEngineV2(session)
            await engine.process(scan_event_id)
            await session.commit()

        # Success — acknowledge
        await redis.xack(STREAM_NAME, GROUP_NAME, entry_id)
        logger.debug(
            f"[StreamConsumer] Processed scan {scan_event_id} "
            f"(attempt {attempt}) — ACK'd"
        )

    except LookupError as e:
        # Transient: scan not in DB yet (commit race). Will be re-enqueued.
        logger.warning(
            f"[StreamConsumer] Transient miss | "
            f"scan={scan_event_id} attempt={attempt} | {e}"
        )
        _requeue_or_dlq(e, attempt, scan_event_id, entry_id, fields, redis)
        return
    except Exception as e:
        logger.error(
            f"[StreamConsumer] Processing failed | "
            f"scan={scan_event_id} attempt={attempt} | error={e}",
            exc_info=True,
        )

        if attempt >= MAX_RETRIES:
            # Dead letter: mark failed_permanent and acknowledge
            try:
                async with db_session_factory() as session:
                    from sqlalchemy import and_, update, select
                    from app.models.scan_event import ScanEvent, ProcessingStatusV2
                    result = await session.execute(
                        select(ScanEvent).where(ScanEvent.id == scan_event_id)
                    )
                    scan = result.scalar_one_or_none()
                    if scan:
                        await session.execute(
                            update(ScanEvent)
                            .where(
                                and_(
                                    ScanEvent.id == scan_event_id,
                                    ScanEvent.scan_timestamp == scan.scan_timestamp,
                                )
                            )
                            .values(processing_status=ProcessingStatusV2.FAILED_PERMANENT)
                        )
                    await session.commit()
            except Exception as e2:
                logger.error(f"[StreamConsumer] Failed to mark failed_permanent: {e2}")

        await _requeue_or_dlq(e, attempt, scan_event_id, entry_id, fields, redis)



async def _requeue_or_dlq(
    exc: Exception,
    attempt: int,
    scan_event_id,
    entry_id: str,
    fields: dict,
    redis,
) -> None:
    """
    Shared re-enqueue / dead-letter helper.

    - attempt < MAX_RETRIES : re-add to stream with attempt+1, ACK original
    - attempt >= MAX_RETRIES: ACK and log dead-letter (do NOT mark failed_permanent
      for LookupError — scan may just not be committed yet)
    """
    if attempt >= MAX_RETRIES:
        await redis.xack(STREAM_NAME, GROUP_NAME, entry_id)
        logger.error(
            f"[StreamConsumer] Scan {scan_event_id} exceeded {MAX_RETRIES} retries "
            f"— dropping from stream. Last error: {exc}"
        )
        return

    try:
        await redis.xadd(
            STREAM_NAME,
            {**fields, "attempt": str(attempt + 1)},
        )
    except Exception as e2:
        logger.error(f"[StreamConsumer] Re-enqueue failed: {e2}")

    await redis.xack(STREAM_NAME, GROUP_NAME, entry_id)
    logger.warning(
        f"[StreamConsumer] Scan {scan_event_id} re-enqueued "
        f"(attempt {attempt} → {attempt + 1})"
    )
