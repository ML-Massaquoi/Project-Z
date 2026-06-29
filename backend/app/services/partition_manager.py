"""
Project Z - Partition Manager
Ensures scan_events partitions exist for any timestamp range being inserted.

PostgreSQL partitioned tables reject inserts that don't match any partition.
This module creates monthly partitions on-demand to prevent constraint violations.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class PartitionManager:
    """Manages monthly range partitions for the scan_events table."""

    PARTITION_TABLE = "scan_events"

    @staticmethod
    async def ensure_partition_exists(
        db: AsyncSession,
        scan_timestamp: datetime,
    ) -> bool:
        """
        Ensure a partition exists for the given timestamp.
        Creates the partition if it doesn't exist.
        Returns True if partition existed or was created successfully.
        """
        if scan_timestamp is None:
            return False

        # Normalize to UTC naive for comparison
        if scan_timestamp.tzinfo is not None:
            ts_utc = scan_timestamp.replace(tzinfo=None)
        else:
            ts_utc = scan_timestamp

        year = ts_utc.year
        month = ts_utc.month

        partition_name = f"{PartitionManager.PARTITION_TABLE}_{year}_{month:02d}"

        # Check if partition already exists
        exists = await db.execute(
            text(
                "SELECT 1 FROM pg_class WHERE relname = :name AND relkind = 'r'"
            ),
            {"name": partition_name},
        )
        if exists.scalar():
            return True

        # Compute partition bounds
        if month == 12:
            next_year = year + 1
            next_month = 1
        else:
            next_year = year
            next_month = month + 1

        lower = f"{year}-{month:02d}-01 00:00:00"
        upper = f"{next_year}-{next_month:02d}-01 00:00:00"

        # NOTE: DDL statements cannot use bind parameters with asyncpg.
        # The values are internally generated dates, not user input.
        try:
            await db.execute(
                text(
                    f"CREATE TABLE IF NOT EXISTS {partition_name} "
                    f"PARTITION OF {PartitionManager.PARTITION_TABLE} "
                    f"FOR VALUES FROM ('{lower}') TO ('{upper}')"
                )
            )
            await db.commit()
            logger.info(
                f"[PartitionManager] Created partition {partition_name} "
                f"for range [{lower}, {upper})"
            )
            return True
        except Exception as e:
            # May already exist (race condition) or permission issue
            logger.warning(
                f"[PartitionManager] Failed to create partition {partition_name}: {e}"
            )
            return False

    @staticmethod
    async def ensure_partitions_for_range(
        db: AsyncSession,
        start: datetime,
        end: datetime,
    ) -> None:
        """Ensure partitions exist for all months in the given range."""
        if start is None or end is None:
            return

        if start.tzinfo is not None:
            start = start.replace(tzinfo=None)
        if end.tzinfo is not None:
            end = end.replace(tzinfo=None)

        # Iterate months from start to end
        current = start.replace(day=1)
        end_month = end.replace(day=1)

        while current <= end_month:
            await PartitionManager.ensure_partition_exists(db, current)
            # Advance to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    @staticmethod
    async def ensure_current_and_future_partitions(
        db: AsyncSession,
        months_ahead: int = 3,
    ) -> None:
        """Create partitions for current month and N months ahead."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        current = now.replace(day=1)

        from datetime import timedelta
        future = now + timedelta(days=30 * months_ahead)
        future_month = future.replace(day=1, hour=0, minute=0, second=0)

        await PartitionManager.ensure_partitions_for_range(db, current, future_month)


# Singleton for convenience
partition_manager = PartitionManager()
