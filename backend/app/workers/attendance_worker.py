"""
Project Z - Attendance Worker
Redis Streams consumer group worker for background attendance processing.

Worker ID: worker-{hostname}-{pid}
Runs as an asyncio background task inside the FastAPI lifespan.
"""
import asyncio
import logging
import os
import socket

logger = logging.getLogger(__name__)


async def run_attendance_worker(db_session_factory) -> None:
    """
    Entry point for the attendance processing worker.
    Initialises Redis, ensures consumer group exists, then runs the consume loop.
    """
    from app.core.config import get_settings
    import redis.asyncio as aioredis
    from app.services.stream_consumer import ensure_consumer_group, consume_loop

    settings = get_settings()
    worker_id = f"worker-{socket.gethostname()}-{os.getpid()}"
    logger.info(f"[AttendanceWorker] Starting worker '{worker_id}'")

    while True:
        redis = None
        try:
            redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await ensure_consumer_group(redis)
            await consume_loop(
                worker_id=worker_id,
                redis=redis,
                db_session_factory=db_session_factory,
            )
        except asyncio.CancelledError:
            logger.info(f"[AttendanceWorker] Worker '{worker_id}' shutting down")
            break
        except Exception as e:
            logger.error(
                f"[AttendanceWorker] Worker crashed: {e} — restarting in 10s",
                exc_info=True,
            )
            await asyncio.sleep(10)
        finally:
            if redis:
                try:
                    await redis.aclose()
                except Exception:
                    pass
