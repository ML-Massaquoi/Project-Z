"""
Project Z - Data Integrity Service
Automated consistency checks and reconciliation across attendance data.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_integrity_log import DataIntegrityLog, CheckCategory, CheckSeverity

logger = logging.getLogger(__name__)


class DataIntegrityService:
    """Service for running data integrity checks and recording findings."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def run_all_checks(self, run_by: str = "integrity_worker") -> list[DataIntegrityLog]:
        """Run all integrity checks and return findings."""
        run_id = str(uuid.uuid4())[:12]
        findings: list[DataIntegrityLog] = []

        logger.info(f"[DataIntegrity] Starting full check run {run_id}")

        check_factories = [
            lambda: self._check_stuck_scans(run_id, run_by),
            lambda: self._check_session_invariants(run_id, run_by),
            lambda: self._check_orphan_scan_events(run_id, run_by),
            lambda: self._check_summary_drift(run_id, run_by),
            lambda: self._check_orphan_attendance_logs(run_id, run_by),
            lambda: self._check_duplicate_sessions(run_id, run_by),
            lambda: self._check_negative_durations(run_id, run_by),
            lambda: self._check_missing_checkouts(run_id, run_by),
        ]

        for factory in check_factories:
            try:
                results = await factory()
                findings.extend(results)
            except Exception as e:
                logger.error(f"[DataIntegrity] Check failed: {e}", exc_info=True)
                findings.append(DataIntegrityLog(
                    check_category=CheckCategory.GENERAL,
                    severity=CheckSeverity.ERROR,
                    check_name="check_execution_error",
                    message=f"Integrity check failed with error: {str(e)[:500]}",
                    affected_count=0,
                    run_by=run_by,
                    run_id=run_id,
                ))

        # Persist all findings
        for finding in findings:
            self.session.add(finding)
        await self.session.commit()

        # Log summary
        errors = sum(1 for f in findings if f.severity in (CheckSeverity.ERROR, CheckSeverity.CRITICAL))
        warnings = sum(1 for f in findings if f.severity == CheckSeverity.WARNING)
        logger.info(
            f"[DataIntegrity] Run {run_id} complete: "
            f"{len(findings)} findings ({errors} errors, {warnings} warnings)"
        )

        return findings

    async def get_findings(
        self,
        category: CheckCategory | None = None,
        severity: CheckSeverity | None = None,
        resolved: bool | None = None,
        limit: int = 100,
    ) -> list[DataIntegrityLog]:
        """Query findings with filters."""
        filters = []
        if category:
            filters.append(DataIntegrityLog.check_category == category)
        if severity:
            filters.append(DataIntegrityLog.severity == severity)
        if resolved is not None:
            filters.append(DataIntegrityLog.resolved == resolved)

        query = (
            select(DataIntegrityLog)
            .where(and_(*filters) if filters else True)
            .order_by(DataIntegrityLog.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_stats(self) -> dict:
        """Get integrity check statistics."""
        now = datetime.now(timezone.utc)
        last_24h = now - timedelta(hours=24)

        # Unresolved by severity
        unresolved_result = await self.session.execute(
            select(DataIntegrityLog.severity, func.count())
            .where(DataIntegrityLog.resolved == False)
            .group_by(DataIntegrityLog.severity)
        )
        unresolved = {row[0].value: row[1] for row in unresolved_result}

        # Findings in last 24h
        recent_result = await self.session.execute(
            select(func.count())
            .select_from(DataIntegrityLog)
            .where(DataIntegrityLog.created_at >= last_24h)
        )
        recent_count = recent_result.scalar_one()

        # Resolved in last 24h
        resolved_result = await self.session.execute(
            select(func.count())
            .select_from(DataIntegrityLog)
            .where(
                and_(
                    DataIntegrityLog.resolved == True,
                    DataIntegrityLog.resolved_at >= last_24h,
                )
            )
        )
        resolved_recent = resolved_result.scalar_one()

        total_unresolved = sum(unresolved.values())

        return {
            "unresolved_by_severity": unresolved,
            "total_unresolved": total_unresolved,
            "findings_last_24h": recent_count,
            "resolved_last_24h": resolved_recent,
        }

    async def resolve_finding(
        self,
        finding_id: uuid.UUID,
        username: str,
        note: str | None = None,
    ) -> DataIntegrityLog | None:
        """Mark a finding as resolved."""
        result = await self.session.execute(
            select(DataIntegrityLog).where(DataIntegrityLog.id == finding_id)
        )
        finding = result.scalar_one_or_none()
        if not finding:
            return None

        finding.resolved = True
        finding.resolved_at = datetime.now(timezone.utc)
        finding.resolved_by = username
        if note:
            finding.resolution_note = note

        await self.session.flush()
        return finding

    # ── Individual Checks ──────────────────────────────────────

    async def _check_stuck_scans(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Detect scan events stuck in PROCESSING state for > 10 minutes."""
        from app.models.scan_event import ScanEvent, ProcessingStatusV2

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        result = await self.session.execute(
            select(func.count()).select_from(ScanEvent).where(
                and_(
                    ScanEvent.processing_status == ProcessingStatusV2.PROCESSING,
                    ScanEvent.created_at < cutoff,
                )
            )
        )
        count = result.scalar_one()

        if count == 0:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.STUCK_PIPELINE,
            severity=CheckSeverity.WARNING if count < 5 else CheckSeverity.ERROR,
            check_name="stuck_processing_scans",
            message=f"{count} scan events stuck in PROCESSING state for over 10 minutes",
            affected_count=count,
            affected_entity_type="scan_event",
            run_by=run_by,
            run_id=run_id,
        )]

    async def _check_session_invariants(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Check that check_out >= check_in for all sessions."""
        from app.models.attendance import AttendanceSession

        result = await self.session.execute(
            select(func.count()).select_from(AttendanceSession).where(
                and_(
                    AttendanceSession.check_in.isnot(None),
                    AttendanceSession.check_out.isnot(None),
                    AttendanceSession.check_out < AttendanceSession.check_in,
                )
            )
        )
        count = result.scalar_one()

        if count == 0:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.SESSION_INVARIANT,
            severity=CheckSeverity.ERROR,
            check_name="check_out_before_check_in",
            message=f"{count} attendance sessions have check_out before check_in (negative duration)",
            affected_count=count,
            affected_entity_type="attendance_session",
            run_by=run_by,
            run_id=run_id,
        )]

    async def _check_orphan_scan_events(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Detect scan events referencing deleted employees."""
        from app.models.scan_event import ScanEvent
        from app.models.employee import Employee

        result = await self.session.execute(
            select(func.count()).select_from(ScanEvent).where(
                and_(
                    ScanEvent.employee_id.isnot(None),
                    ~ScanEvent.employee_id.in_(
                        select(Employee.id)
                    ),
                )
            )
        )
        count = result.scalar_one()

        if count == 0:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.ORPHAN_RECORD,
            severity=CheckSeverity.WARNING,
            check_name="orphan_scan_events",
            message=f"{count} scan events reference non-existent employees",
            affected_count=count,
            affected_entity_type="scan_event",
            run_by=run_by,
            run_id=run_id,
        )]

    async def _check_summary_drift(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Check if attendance summaries match actual session counts."""
        from app.models.attendance_summary import AttendanceSummary
        from app.models.attendance import AttendanceSession, AttendanceStatus

        today = datetime.now(timezone.utc).date()

        # Get today's summaries
        summary_result = await self.session.execute(
            select(AttendanceSummary).where(AttendanceSummary.summary_date == today)
        )
        summaries = summary_result.scalars().all()

        drift_findings = []

        for summary in summaries:
            # Count actual sessions for this department today
            actual_result = await self.session.execute(
                select(
                    func.count().label("total"),
                    func.count().filter(
                        AttendanceSession.status.in_(["present", "late", "on_time", "early_arrival"])
                    ).label("present"),
                    func.count().filter(
                        AttendanceSession.status == "absent"
                    ).label("absent"),
                )
                .join(AttendanceSession.employee, isouter=True)
                .where(
                    and_(
                        AttendanceSession.shift_date == today,
                        AttendanceSession.employee.has(department_id=summary.department_id),
                    )
                )
            )
            actual = actual_result.one()

            # Check for drift
            present_drift = abs((summary.present_count or 0) - actual.present)
            absent_drift = abs((summary.absent_count or 0) - actual.absent)

            if present_drift > 0 or absent_drift > 0:
                drift_findings.append(DataIntegrityLog(
                    check_category=CheckCategory.SUMMARY_DRIFT,
                    severity=CheckSeverity.WARNING,
                    check_name="summary_count_drift",
                    message=(
                        f"Department summary drift detected: "
                        f"present expected={summary.present_count} actual={actual.present}, "
                        f"absent expected={summary.absent_count} actual={actual.absent}"
                    ),
                    affected_count=present_drift + absent_drift,
                    affected_entity_type="attendance_summary",
                    affected_ids=[str(summary.id)],
                    run_by=run_by,
                    run_id=run_id,
                ))

        return drift_findings

    async def _check_orphan_attendance_logs(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Detect attendance logs with session_id pointing to deleted sessions."""
        from app.models.attendance import AttendanceLog, AttendanceSession

        result = await self.session.execute(
            select(func.count()).select_from(AttendanceLog).where(
                and_(
                    AttendanceLog.session_id.isnot(None),
                    ~AttendanceLog.session_id.in_(
                        select(AttendanceSession.id)
                    ),
                )
            )
        )
        count = result.scalar_one()

        if count == 0:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.ORPHAN_RECORD,
            severity=CheckSeverity.INFO,
            check_name="orphan_attendance_logs",
            message=f"{count} attendance logs reference deleted sessions (session_id is SET NULL on delete, but log still exists)",
            affected_count=count,
            affected_entity_type="attendance_log",
            run_by=run_by,
            run_id=run_id,
        )]

    async def _check_duplicate_sessions(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Check for duplicate attendance sessions (same employee, same date)."""
        from app.models.attendance import AttendanceSession

        # Group by employee + shift_date (fall back to date for legacy rows without shift_date)
        result = await self.session.execute(
            select(
                AttendanceSession.employee_id,
                func.coalesce(AttendanceSession.shift_date, AttendanceSession.date).label("resolved_date"),
                func.count().label("cnt"),
            )
            .group_by(
                AttendanceSession.employee_id,
                func.coalesce(AttendanceSession.shift_date, AttendanceSession.date),
            )
            .having(func.count() > 1)
        )
        duplicates = result.all()

        if not duplicates:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.SESSION_INVARIANT,
            severity=CheckSeverity.ERROR,
            check_name="duplicate_attendance_sessions",
            message=f"{len(duplicates)} employees have duplicate attendance sessions on the same date",
            affected_count=len(duplicates),
            affected_entity_type="attendance_session",
            affected_ids=[f"{d[0]}:{d[1]}" for d in duplicates[:50]],
            run_by=run_by,
            run_id=run_id,
        )]

    async def _check_negative_durations(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Check for sessions with negative or unreasonable duration."""
        from app.models.attendance import AttendanceSession

        result = await self.session.execute(
            select(func.count()).select_from(AttendanceSession).where(
                and_(
                    AttendanceSession.duration_minutes.isnot(None),
                    AttendanceSession.duration_minutes < 0,
                )
            )
        )
        count = result.scalar_one()

        # Also check for unreasonably long sessions (> 24 hours)
        long_result = await self.session.execute(
            select(func.count()).select_from(AttendanceSession).where(
                and_(
                    AttendanceSession.duration_minutes.isnot(None),
                    AttendanceSession.duration_minutes > 1440,
                )
            )
        )
        long_count = long_result.scalar_one()

        findings = []
        if count > 0:
            findings.append(DataIntegrityLog(
                check_category=CheckCategory.SESSION_INVARIANT,
                severity=CheckSeverity.ERROR,
                check_name="negative_duration_sessions",
                message=f"{count} sessions have negative duration_minutes",
                affected_count=count,
                affected_entity_type="attendance_session",
                run_by=run_by,
                run_id=run_id,
            ))

        if long_count > 0:
            findings.append(DataIntegrityLog(
                check_category=CheckCategory.SESSION_INVARIANT,
                severity=CheckSeverity.WARNING,
                check_name="excessive_duration_sessions",
                message=f"{long_count} sessions have duration > 24 hours",
                affected_count=long_count,
                affected_entity_type="attendance_session",
                run_by=run_by,
                run_id=run_id,
            ))

        return findings

    async def _check_missing_checkouts(self, run_id: str, run_by: str) -> list[DataIntegrityLog]:
        """Detect sessions from previous days that are still open (no check_out)."""
        from app.models.attendance import AttendanceSession

        yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
        # Use coalesce(shift_date, date) so legacy rows without shift_date are still caught
        result = await self.session.execute(
            select(func.count()).select_from(AttendanceSession).where(
                and_(
                    func.coalesce(AttendanceSession.shift_date, AttendanceSession.date) < yesterday,
                    AttendanceSession.check_out.is_(None),
                    AttendanceSession.is_complete == False,
                )
            )
        )
        count = result.scalar_one()

        if count == 0:
            return []

        return [DataIntegrityLog(
            check_category=CheckCategory.SESSION_INVARIANT,
            severity=CheckSeverity.WARNING,
            check_name="missing_checkouts",
            message=f"{count} sessions from before yesterday are still open (no check_out)",
            affected_count=count,
            affected_entity_type="attendance_session",
            run_by=run_by,
            run_id=run_id,
        )]
