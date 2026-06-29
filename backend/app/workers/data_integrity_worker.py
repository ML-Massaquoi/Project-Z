"""
Project Z - Data Integrity Worker
Periodically runs consistency checks across attendance data.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.metrics import metrics

logger = logging.getLogger(__name__)

WORKER_INTERVAL = 1800  # Run checks every 30 minutes


async def run_data_integrity_worker(
    session_factory: async_sessionmaker,
) -> None:
    """
    Background worker that:
    1. Runs all data integrity checks every 30 minutes
    2. Records findings in data_integrity_logs
    3. Generates system alerts for critical findings
    """
    logger.info("[DataIntegrityWorker] Starting...")

    cycle = 0

    while True:
        cycle += 1

        try:
            # Record heartbeat
            metrics.update_worker_heartbeat("data_integrity_worker")

            async with session_factory() as session:
                from app.services.data_integrity_service import DataIntegrityService
                service = DataIntegrityService(session)

                logger.info(f"[DataIntegrityWorker] Cycle {cycle}: Running integrity checks...")
                findings = await service.run_all_checks(run_by="integrity_worker")

                # Generate alerts for critical findings
                await _alert_on_critical_findings(session, findings)

                errors = sum(1 for f in findings if f.severity.value in ("error", "critical"))
                warnings = sum(1 for f in findings if f.severity.value == "warning")
                logger.info(
                    f"[DataIntegrityWorker] Cycle {cycle} complete: "
                    f"{len(findings)} findings ({errors} errors, {warnings} warnings)"
                )

        except asyncio.CancelledError:
            logger.info("[DataIntegrityWorker] Cancelled, shutting down")
            return
        except Exception as e:
            logger.error(f"[DataIntegrityWorker] Cycle {cycle} error: {e}", exc_info=True)

        await asyncio.sleep(WORKER_INTERVAL)


async def _alert_on_critical_findings(session, findings: list):
    """Generate system alerts for critical/error findings."""
    from app.models.data_integrity_log import CheckSeverity
    from app.services.alert_service import create_system_alert
    from app.models.system_alert import AlertSeverity

    critical_findings = [
        f for f in findings
        if f.severity in (CheckSeverity.ERROR, CheckSeverity.CRITICAL)
    ]

    if not critical_findings:
        return

    # Summarize into a single alert
    total_affected = sum(f.affected_count for f in critical_findings)
    check_names = list(set(f.check_name for f in critical_findings))[:5]

    await create_system_alert(
        session=session,
        severity=AlertSeverity.WARNING if len(critical_findings) < 3 else AlertSeverity.CRITICAL,
        title=f"Data Integrity: {len(critical_findings)} issues found",
        message=(
            f"Integrity checks detected {len(critical_findings)} error-level issues "
            f"affecting {total_affected} records. "
            f"Checks: {', '.join(check_names)}"
        ),
        source="data_integrity_worker",
        extra={
            "findings_count": len(critical_findings),
            "total_affected": total_affected,
            "check_names": check_names,
        },
    )
