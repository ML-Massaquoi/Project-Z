"""
Project Z - Alert Repository
Specialized queries for system alerts.
"""

from datetime import datetime, timezone
from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_alert import SystemAlert, AlertSeverity, AlertCategory
from app.repositories.base import BaseRepository


class AlertRepository(BaseRepository[SystemAlert]):
    """Repository for system alert queries."""

    def __init__(self, session: AsyncSession):
        super().__init__(SystemAlert, session)

    async def list_active(
        self,
        skip: int = 0,
        limit: int = 50,
        severity: Optional[AlertSeverity] = None,
        category: Optional[AlertCategory] = None,
        include_expired: bool = False,
    ) -> Sequence[SystemAlert]:
        """List non-acknowledged alerts, optionally filtered."""
        filters = [SystemAlert.acknowledged == False]

        if not include_expired:
            now = datetime.now(timezone.utc)
            filters.append(
                (SystemAlert.expires_at == None) | (SystemAlert.expires_at > now)
            )

        if severity:
            filters.append(SystemAlert.severity == severity)
        if category:
            filters.append(SystemAlert.category == category)

        query = (
            select(SystemAlert)
            .where(and_(*filters))
            .order_by(SystemAlert.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def list_acknowledged(
        self,
        skip: int = 0,
        limit: int = 50,
    ) -> Sequence[SystemAlert]:
        """List acknowledged alerts (history)."""
        query = (
            select(SystemAlert)
            .where(SystemAlert.acknowledged == True)
            .order_by(SystemAlert.acknowledged_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def count_active(
        self,
        severity: Optional[AlertSeverity] = None,
        category: Optional[AlertCategory] = None,
    ) -> int:
        """Count active (unacknowledged) alerts."""
        filters = [SystemAlert.acknowledged == False]
        now = datetime.now(timezone.utc)
        filters.append(
            (SystemAlert.expires_at == None) | (SystemAlert.expires_at > now)
        )
        if severity:
            filters.append(SystemAlert.severity == severity)
        if category:
            filters.append(SystemAlert.category == category)

        query = select(func.count()).select_from(SystemAlert).where(and_(*filters))
        result = await self.session.execute(query)
        return result.scalar_one()

    async def acknowledge(
        self,
        alert_id: UUID,
        username: str,
        resolution_note: Optional[str] = None,
    ) -> Optional[SystemAlert]:
        """Acknowledge a single alert."""
        now = datetime.now(timezone.utc)
        values = {
            "acknowledged": True,
            "acknowledged_by": username,
            "acknowledged_at": now,
            "updated_at": now,
        }
        if resolution_note:
            values["resolution_note"] = resolution_note

        await self.session.execute(
            update(SystemAlert)
            .where(SystemAlert.id == alert_id)
            .values(**values)
        )
        await self.session.flush()
        return await self.get_by_id(alert_id)

    async def acknowledge_all(self, username: str) -> int:
        """Acknowledge all active alerts. Returns count affected."""
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            update(SystemAlert)
            .where(SystemAlert.acknowledged == False)
            .values(
                acknowledged=True,
                acknowledged_by=username,
                acknowledged_at=now,
                updated_at=now,
            )
        )
        await self.session.flush()
        return result.rowcount

    async def purge_expired(self) -> int:
        """Delete expired alerts. Returns count deleted."""
        now = datetime.now(timezone.utc)
        from sqlalchemy import delete
        result = await self.session.execute(
            delete(SystemAlert).where(
                and_(
                    SystemAlert.expires_at != None,
                    SystemAlert.expires_at < now,
                )
            )
        )
        await self.session.flush()
        return result.rowcount

    async def get_stats(self) -> dict:
        """Get alert statistics."""
        now = datetime.now(timezone.utc)

        # Active count by severity
        active_query = (
            select(SystemAlert.severity, func.count())
            .where(
                and_(
                    SystemAlert.acknowledged == False,
                    (SystemAlert.expires_at == None) | (SystemAlert.expires_at > now),
                )
            )
            .group_by(SystemAlert.severity)
        )
        active_result = await self.session.execute(active_query)
        active_by_severity = {row[0].value: row[1] for row in active_result}

        # Total acknowledged today
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ack_result = await self.session.execute(
            select(func.count())
            .select_from(SystemAlert)
            .where(
                and_(
                    SystemAlert.acknowledged == True,
                    SystemAlert.acknowledged_at >= today_start,
                )
            )
        )
        acknowledged_today = ack_result.scalar_one()

        # Total created today
        created_result = await self.session.execute(
            select(func.count())
            .select_from(SystemAlert)
            .where(SystemAlert.created_at >= today_start)
        )
        created_today = created_result.scalar_one()

        return {
            "active_by_severity": active_by_severity,
            "total_active": sum(active_by_severity.values()),
            "acknowledged_today": acknowledged_today,
            "created_today": created_today,
        }
