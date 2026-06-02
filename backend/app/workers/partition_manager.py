"""
Project Z - Partition Manager Worker
Creates next month's scan_events partition on the 25th of each month.

Ensures the partitioned scan_events table always has a partition ready
for the upcoming month before it starts.
"""
import asyncio
import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)


def _next_month(d: date) -> date:
    """Return the first day of the month after d."""
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _partition_bounds(year: int, month: int) -> tuple[str, str]:
    """Return (start_str, end_str) for a monthly partition."""
    start = date(year, month, 1)
    end = _next_month(start)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


async def ensure_next_month_partition(session) -> None:
    """
    Create next month's scan_events partition if it doesn't already exist.
    Safe to call multiple times (uses CREATE TABLE IF NOT EXISTS).
    """
    from sqlalchemy import text

    today = date.today()
    next_m = _next_month(today)
    partition_name = f"scan_events_{next_m.year}_{next_m.month:02d}"
    start_str, end_str = _partition_bounds(next_m.year, next_m.month)

    await session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {partition_name}
            PARTITION OF scan_events
            FOR VALUES FROM ('{start_str}') TO ('{end_str}');
    """))
    await session.commit()
    logger.info(
        f"[PartitionManager] Ensured partition {partition_name} "
        f"({start_str} → {end_str})"
    )


async def run_partition_manager(db_session_factory) -> None:
    """
    Background loop: runs ensure_next_month_partition on the 25th of each month.
    Also runs once at startup to ensure current + next month partitions exist.
    """
    logger.info("[PartitionManager] Starting partition manager task")

    # Run once at startup
    try:
        async with db_session_factory() as session:
            await ensure_next_month_partition(session)
    except Exception as e:
        logger.error(f"[PartitionManager] Startup partition check failed: {e}", exc_info=True)

    while True:
        try:
            # Sleep until next check (daily check, act on the 25th)
            await asyncio.sleep(86400)  # 24 hours
            today = date.today()
            if today.day == 25:
                async with db_session_factory() as session:
                    await ensure_next_month_partition(session)
        except asyncio.CancelledError:
            logger.info("[PartitionManager] Partition manager task cancelled")
            break
        except Exception as e:
            logger.error(f"[PartitionManager] Error: {e}", exc_info=True)
