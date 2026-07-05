"""
Project Z - Device Health Service
Active device probing, health scoring, and diagnostics.
"""

import asyncio
import logging
import socket
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device, DeviceHealthStatus
from app.models.device_health_log import DeviceHealthLog, HealthCheckResult
from app.repositories.device import DeviceRepository

logger = logging.getLogger(__name__)

TCP_PROBE_TIMEOUT = 3

# Health status thresholds (consecutive failures → status)
FAILURE_THRESHOLDS = {
    0: DeviceHealthStatus.HEALTHY,
    1: DeviceHealthStatus.HEALTHY,
    2: DeviceHealthStatus.DEGRADED,
    3: DeviceHealthStatus.CRITICAL,
}

# Response time thresholds (ms)
RESPONSE_TIME_HEALTHY_MS = 2000
RESPONSE_TIME_DEGRADED_MS = 5000


class DeviceHealthService:
    """Service for device health probing, scoring, and history."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = DeviceRepository(session)

    async def probe_device(
        self,
        device_id: UUID,
        checked_by: str = "health_worker",
    ) -> DeviceHealthLog:
        """Actively probe a device via TCP SDK and record the result."""
        from app.services.sdk_service import ZKSDKService
        from app.services.device_queue_manager import DeviceQueueManager

        device = await self.repo.get_by_id(device_id)
        if not device:
            raise ValueError(f"Device {device_id} not found")

        start_time = time.monotonic()
        check_result: HealthCheckResult
        error_message: Optional[str] = None

        # Skip devices with active enrollment
        if device.ip_address and ZKSDKService.is_enrollment_active(device.ip_address):
            logger.debug(f"[DeviceHealth] Skipping {device.name} — enrollment in progress")
            return DeviceHealthLog(
                device_id=device.id,
                check_result=HealthCheckResult.SUCCESS,
                response_time_ms=0,
                error_message=None,
                device_online=True,
                scan_count_at_check=device.total_scan_count,
                checked_by=checked_by,
            )

        # Check if DeviceQueueManager worker is busy with a high-priority job
        if device.ip_address:
            manager = await DeviceQueueManager.get_instance()
            worker = manager._workers.get(device.ip_address)
            if worker and worker.state.value == "busy" and worker.current_job:
                current_priority = worker.current_job.priority
                from app.services.device_queue_manager import JobPriority
                if current_priority >= JobPriority.SYNC_USERS:
                    logger.debug(
                        f"[DeviceHealth] Skipping {device.name} — "
                        f"worker busy with {worker.current_job.job_type}"
                    )
                    return DeviceHealthLog(
                        device_id=device.id,
                        check_result=HealthCheckResult.SUCCESS,
                        response_time_ms=0,
                        error_message=None,
                        device_online=True,
                        scan_count_at_check=device.total_scan_count,
                        checked_by=checked_by,
                    )

        try:
            ip = device.ip_address
            port = device.sdk_port or 4370
            loop = asyncio.get_event_loop()

            def _check_port():
                try:
                    with socket.create_connection((ip, port), timeout=TCP_PROBE_TIMEOUT):
                        return True
                except (ConnectionRefusedError, TimeoutError, OSError):
                    return False

            sdk_reachable = await loop.run_in_executor(None, _check_port)

            if not sdk_reachable:
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                check_result = HealthCheckResult.CONNECTION_REFUSED
                error_message = f"SDK port {port} not reachable"
            else:
                # Use run_sdk_operations for minimal SDK interaction
                def _health_sdk_op(sdk):
                    """Get users count as a basic health check."""
                    users = sdk.get_users()
                    return len(users)

                try:
                    user_count = await manager.run_sdk_operations(
                        device_ip=ip,
                        port=port,
                        timeout=10,
                        handler=_health_sdk_op,
                    )
                    elapsed_ms = int((time.monotonic() - start_time) * 1000)
                    check_result = HealthCheckResult.SUCCESS
                    error_message = None
                except Exception as e:
                    elapsed_ms = int((time.monotonic() - start_time) * 1000)
                    check_result = HealthCheckResult.SDK_ERROR
                    error_message = str(e)[:500]

        except TimeoutError:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            check_result = HealthCheckResult.TIMEOUT
            error_message = "TCP SDK connection timed out"
        except ConnectionRefusedError:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            check_result = HealthCheckResult.CONNECTION_REFUSED
            error_message = "TCP connection refused"
        except Exception as e:
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            check_result = HealthCheckResult.SDK_ERROR
            error_message = str(e)[:500]

        # Record the health log entry
        log_entry = DeviceHealthLog(
            device_id=device.id,
            check_result=check_result,
            response_time_ms=elapsed_ms,
            error_message=error_message,
            device_online=check_result == HealthCheckResult.SUCCESS,
            scan_count_at_check=device.total_scan_count,
            checked_by=checked_by,
        )
        self.session.add(log_entry)

        # Update device health fields
        is_success = check_result == HealthCheckResult.SUCCESS
        new_failures = 0 if is_success else device.consecutive_failures + 1
        health_status = FAILURE_THRESHOLDS.get(
            min(new_failures, 3), DeviceHealthStatus.CRITICAL
        )

        if not is_success and health_status != DeviceHealthStatus.CRITICAL:
            if elapsed_ms > RESPONSE_TIME_DEGRADED_MS:
                health_status = DeviceHealthStatus.CRITICAL
            elif elapsed_ms > RESPONSE_TIME_HEALTHY_MS:
                health_status = DeviceHealthStatus.DEGRADED

        # Update rolling average response time
        if is_success:
            if device.avg_response_time_ms:
                device.avg_response_time_ms = int(
                    (device.avg_response_time_ms * 0.7) + (elapsed_ms * 0.3)
                )
            else:
                device.avg_response_time_ms = elapsed_ms

        device.consecutive_failures = new_failures
        device.health_status = health_status.value
        device.last_health_check = datetime.now(timezone.utc)

        await self.session.flush()
        await self.session.refresh(log_entry)

        logger.info(
            f"[DeviceHealth] Probed {device.serial_number}: "
            f"{check_result.value} in {elapsed_ms}ms → {health_status.value}"
        )

        return log_entry

    async def probe_all_active_devices(self) -> list[DeviceHealthLog]:
        """Probe all active devices and return results."""
        result = await self.session.execute(
            select(Device).where(Device.is_active == True)
        )
        devices = result.scalars().all()
        logs = []

        for device in devices:
            try:
                log = await self.probe_device(device.id, checked_by="health_worker")
                logs.append(log)
            except Exception as e:
                logger.error(
                    f"[DeviceHealth] Failed to probe {device.serial_number}: {e}"
                )

        await self.session.commit()
        return logs

    async def get_device_health_summary(self, device_id: UUID) -> dict:
        """Get health summary for a single device."""
        device = await self.repo.get_by_id(device_id)
        if not device:
            raise ValueError(f"Device {device_id} not found")

        now = datetime.now(timezone.utc)
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        # Success rate (last 24h)
        result_24h = await self.session.execute(
            select(
                func.count().label("total"),
                func.count().filter(
                    DeviceHealthLog.check_result == HealthCheckResult.SUCCESS
                ).label("successes"),
            )
            .where(
                and_(
                    DeviceHealthLog.device_id == device_id,
                    DeviceHealthLog.created_at >= last_24h,
                )
            )
        )
        row_24h = result_24h.one()
        uptime_24h = (
            (row_24h.successes / row_24h.total * 100) if row_24h.total > 0 else None
        )

        # Success rate (last 7d)
        result_7d = await self.session.execute(
            select(
                func.count().label("total"),
                func.count().filter(
                    DeviceHealthLog.check_result == HealthCheckResult.SUCCESS
                ).label("successes"),
            )
            .where(
                and_(
                    DeviceHealthLog.device_id == device_id,
                    DeviceHealthLog.created_at >= last_7d,
                )
            )
        )
        row_7d = result_7d.one()
        uptime_7d = (
            (row_7d.successes / row_7d.total * 100) if row_7d.total > 0 else None
        )

        # Average response time (last 24h)
        avg_rt = await self.session.execute(
            select(func.avg(DeviceHealthLog.response_time_ms))
            .where(
                and_(
                    DeviceHealthLog.device_id == device_id,
                    DeviceHealthLog.check_result == HealthCheckResult.SUCCESS,
                    DeviceHealthLog.created_at >= last_24h,
                )
            )
        )
        avg_response_time = avg_rt.scalar()

        # Error breakdown (last 24h)
        error_result = await self.session.execute(
            select(
                DeviceHealthLog.check_result,
                func.count(),
            )
            .where(
                and_(
                    DeviceHealthLog.device_id == device_id,
                    DeviceHealthLog.check_result != HealthCheckResult.SUCCESS,
                    DeviceHealthLog.created_at >= last_24h,
                )
            )
            .group_by(DeviceHealthLog.check_result)
        )
        error_breakdown = {row[0].value: row[1] for row in error_result}

        return {
            "device_id": str(device.id),
            "serial_number": device.serial_number,
            "health_status": device.health_status,
            "is_online": device.is_online,
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
            "last_health_check": (
                device.last_health_check.isoformat() if device.last_health_check else None
            ),
            "consecutive_failures": device.consecutive_failures,
            "avg_response_time_ms": device.avg_response_time_ms,
            "uptime_24h_percent": round(uptime_24h, 2) if uptime_24h is not None else None,
            "uptime_7d_percent": round(uptime_7d, 2) if uptime_7d is not None else None,
            "total_checks_24h": row_24h.total,
            "error_breakdown_24h": error_breakdown,
        }

    async def get_all_devices_health_summary(self) -> list[dict]:
        """Get health summary for all devices."""
        result = await self.session.execute(
            select(Device).where(Device.is_active == True).order_by(Device.health_status)
        )
        devices = result.scalars().all()

        summaries = []
        for device in devices:
            summaries.append({
                "device_id": str(device.id),
                "serial_number": device.serial_number,
                "name": device.name,
                "ip_address": device.ip_address,
                "office_id": str(device.office_id) if device.office_id else None,
                "health_status": device.health_status,
                "is_online": device.is_online,
                "last_seen": device.last_seen.isoformat() if device.last_seen else None,
                "last_health_check": (
                    device.last_health_check.isoformat() if device.last_health_check else None
                ),
                "consecutive_failures": device.consecutive_failures,
                "avg_response_time_ms": device.avg_response_time_ms,
                "firmware_version": device.firmware_version,
            })

        return summaries

    async def get_health_history(
        self,
        device_id: UUID,
        hours: int = 24,
        limit: int = 200,
    ) -> list[dict]:
        """Get health check history for a device."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        result = await self.session.execute(
            select(DeviceHealthLog)
            .where(
                and_(
                    DeviceHealthLog.device_id == device_id,
                    DeviceHealthLog.created_at >= cutoff,
                )
            )
            .order_by(DeviceHealthLog.created_at.desc())
            .limit(limit)
        )
        logs = result.scalars().all()

        return [
            {
                "id": str(log.id),
                "check_result": log.check_result.value,
                "response_time_ms": log.response_time_ms,
                "error_message": log.error_message,
                "device_online": log.device_online,
                "checked_by": log.checked_by,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]

    async def get_system_health_overview(self) -> dict:
        """Get overall device fleet health overview."""
        now = datetime.now(timezone.utc)

        # Count by health status
        status_result = await self.session.execute(
            select(Device.health_status, func.count())
            .where(Device.is_active == True)
            .group_by(Device.health_status)
        )
        status_counts = {row[0]: row[1] for row in status_result}

        # Count online/offline
        online_result = await self.session.execute(
            select(
                func.count().filter(Device.is_online == True),
                func.count().filter(Device.is_online == False),
            ).select_from(Device).where(Device.is_active == True)
        )
        online_row = online_result.one()

        # Average response time across all devices (last 1h)
        last_1h = now - timedelta(hours=1)
        avg_rt = await self.session.execute(
            select(func.avg(DeviceHealthLog.response_time_ms))
            .where(
                and_(
                    DeviceHealthLog.check_result == HealthCheckResult.SUCCESS,
                    DeviceHealthLog.created_at >= last_1h,
                )
            )
        )
        avg_response = avg_rt.scalar()

        total_devices = sum(status_counts.values())

        return {
            "total_devices": total_devices,
            "online_count": online_row[0],
            "offline_count": online_row[1],
            "health_status_counts": status_counts,
            "avg_response_time_ms": int(avg_response) if avg_response else None,
            "fleet_health_percent": round(
                (status_counts.get("healthy", 0) / total_devices * 100)
                if total_devices > 0 else 0,
                1,
            ),
        }
