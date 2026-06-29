"""
Project Z - SDK Attendance Polling Worker
Polls biometric devices via TCP SDK (pyzk) to pull attendance records.

Replaces ADMS push for devices that don't support online push.
Connects via TCP port 4370, reads attendance, stores in database.

Deduplication: uses device.last_activity as persistent watermark to avoid re-ingesting.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 30


async def poll_device(device, db_session_factory) -> dict:
    """
    Poll a single device for attendance records via TCP SDK.
    Returns a summary dict.

    Skips devices with active enrollment sessions to avoid TCP connection conflicts.
    ZKTeco devices only support ONE concurrent TCP connection.
    """
    from app.services.ingestion_service import IngestionService
    from app.services.device_service import DeviceService
    from app.models.scan_event import ScanResult
    from app.services.sdk_service import ZKSDKService, get_device_lock

    result = {
        "device_id": str(device.id),
        "serial_number": device.serial_number,
        "records_found": 0,
        "records_ingested": 0,
        "unknown_users": 0,
        "errors": [],
    }

    if not device.ip_address:
        result["errors"].append("No IP address configured")
        return result

    # Skip devices with active enrollment — they hold the only TCP session
    if ZKSDKService.is_enrollment_active(device.ip_address):
        logger.debug(
            f"[SDK Poll] Skipping {device.name} — enrollment in progress"
        )
        return result

    # Quick TCP probe BEFORE lock — avoids blocking enrollment flow while probing.
    import socket
    try:
        with socket.create_connection(
            (device.ip_address, device.sdk_port or 4370), timeout=3
        ):
            pass
    except (ConnectionRefusedError, TimeoutError, OSError):
        logger.debug(
            f"[SDK Poll] Skipping unreachable device {device.name} "
            f"({device.serial_number}) — SDK port closed"
        )
        return result

    # Acquire per-device lock — now held for minimum time (SDK operations only).
    device_lock = get_device_lock(device.ip_address)
    async with device_lock:
        # Check enrollment inside the lock — may have started while we probed
        if ZKSDKService.is_enrollment_active(device.ip_address):
            logger.debug(
                f"[SDK Poll] Skipping {device.name} — enrollment in progress"
            )
            return result

        # Run synchronous pyzk in a thread pool to avoid blocking the event loop
        try:
            loop = asyncio.get_event_loop()
            device_records = await loop.run_in_executor(
                None, _fetch_attendance_from_device, device.ip_address, device.sdk_port or 4370
            )
        except Exception as e:
            result["errors"].append(f"SDK connection failed: {e}")
            logger.warning(
                f"[SDK Poll] Connection failed | device={device.name} "
                f"({device.serial_number}) | IP={device.ip_address} | error={e}"
            )
            return result

    if not device_records:
        logger.debug(f"[SDK Poll] No records | device={device.serial_number}")
        return result

    # Filter out old records (>90 days) — no partition exists for them
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=90)
    filtered = []
    for r in device_records:
        ts = r.get("timestamp")
        if ts is None:
            continue
        # Make naive datetimes timezone-aware (assume UTC)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts > cutoff:
            r["timestamp"] = ts  # store normalized timestamp
            filtered.append(r)
    device_records = filtered

    # Filter out already-processed records using database watermark
    last_ts = None
    if device.last_activity:
        try:
            last_ts = datetime.fromisoformat(device.last_activity).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass
    
    if last_ts:
        device_records = [
            r for r in device_records
            if r.get("timestamp") and r["timestamp"] > last_ts
        ]

    if not device_records:
        logger.debug(f"[SDK Poll] No new records | device={device.serial_number}")
        return result

    result["records_found"] = len(device_records)

    # Process each record
    async with db_session_factory() as db:
        try:
            # Update device status
            device_service = DeviceService(db)
            await device_service.handle_device_connection(device.serial_number, device.ip_address)

            ingestion = IngestionService(db)
            unknown_users = set()

            for rec in device_records:
                try:
                    # Parse timestamp
                    scan_timestamp = rec.get("timestamp")
                    if isinstance(scan_timestamp, str):
                        from app.utils.adms_parser import _parse_timestamp
                        scan_timestamp = _parse_timestamp(scan_timestamp)
                    if scan_timestamp is None:
                        continue

                    # Make timezone-aware if naive
                    if scan_timestamp.tzinfo is None:
                        scan_timestamp = scan_timestamp.replace(tzinfo=timezone.utc)

                    user_id = str(rec.get("user_id", ""))
                    status = rec.get("status", 0)
                    punch = rec.get("punch", 0)

                    # Map punch direction: 0=in, 1=out
                    raw_punch_state = punch if punch is not None else (0 if status == 0 else 1)

                    # Skip records with timestamps more than 1 day in the future
                    server_now = datetime.now(timezone.utc)
                    if scan_timestamp > server_now + timedelta(days=1):
                        logger.warning(
                            f"[SDK Poll] Skipping future record: device={scan_timestamp} server={server_now}"
                        )
                        continue

                    # Use device timestamp as-is (don't override with server time)
                    # The device may have clock drift from power outages, but the
                    # attendance date should match what the device reported.

                    scan_event = await ingestion.ingest(
                        device_serial=device.serial_number,
                        device_user_id=user_id,
                        scan_timestamp=scan_timestamp,
                        verify_type_code=1,  # fingerprint (default for SDK pulls)
                        raw_punch_state=raw_punch_state,
                        raw_payload={
                            "user_id": user_id,
                            "timestamp": str(scan_timestamp),
                            "status": status,
                            "punch": punch,
                            "source": "sdk_poll",
                        },
                        source_ip=device.ip_address,
                    )

                    if scan_event:
                        if scan_event.scan_result == ScanResult.UNKNOWN_USER:
                            unknown_users.add(user_id)
                        result["records_ingested"] += 1

                except Exception as e:
                    result["errors"].append(f"Error processing record user={rec.get('user_id')}: {e}")

            if unknown_users:
                result["unknown_users"] = len(unknown_users)
                logger.warning(
                    f"[SDK Poll] Unknown users from {device.serial_number}: "
                    f"{sorted(unknown_users)}"
                )

            await db.commit()

            # Update watermark in database (device.last_activity)
            if device_records:
                latest_ts = max(r.get("timestamp") for r in device_records if r.get("timestamp"))
                if latest_ts:
                    from app.models.device import Device
                    from sqlalchemy import update
                    await db.execute(
                        update(Device)
                        .where(Device.id == device.id)
                        .values(last_activity=latest_ts.isoformat())
                    )
                    await db.commit()

        except Exception as e:
            result["errors"].append(f"DB error: {e}")
            logger.error(f"[SDK Poll] DB error for {device.serial_number}: {e}", exc_info=True)
            await db.rollback()

    return result


def _fetch_attendance_from_device(ip: str, port: int) -> list[dict]:
    """
    Synchronous: connect to device via TCP SDK and fetch attendance records.
    Returns list of dicts with user_id, timestamp, status, punch.
    """
    from zk import ZK

    zk = ZK(ip, port=port, timeout=5, password=0, force_udp=False, ommit_ping=True)
    conn = zk.connect()
    try:
        conn.disable_device()
        attendances = conn.get_attendance()
        conn.enable_device()

        result = []
        for a in attendances:
            result.append({
                "user_id": str(a.user_id),
                "timestamp": a.timestamp,
                "status": a.status,
                "punch": a.punch,
            })
        return result
    finally:
        conn.disconnect()


async def run_sdk_polling_worker(db_session_factory) -> None:
    """
    Background loop: polls all online devices every POLL_INTERVAL_SECONDS.
    """
    from sqlalchemy import select
    from app.models.device import Device

    logger.info("[SDKPoll] Starting SDK polling worker")

    while True:
        try:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

            async with db_session_factory() as session:
                result = await session.execute(
                    select(Device).where(Device.is_active == True)
                )
                devices = result.scalars().all()

                if not devices:
                    continue

                for device in devices:
                    try:
                        poll_result = await poll_device(device, db_session_factory)

                        if poll_result["records_ingested"] > 0:
                            logger.info(
                                f"[SDK Poll] {device.serial_number}: "
                                f"found={poll_result['records_found']} "
                                f"ingested={poll_result['records_ingested']} "
                                f"unknown={poll_result['unknown_users']}"
                            )

                            # Broadcast WebSocket event
                            from app.services.websocket_service import ws_manager
                            await ws_manager.broadcast("attendance_update", {
                                "source": "sdk_poll",
                                "device_serial": device.serial_number,
                                "records_ingested": poll_result["records_ingested"],
                            })

                    except Exception as e:
                        logger.error(
                            f"[SDK Poll] Error polling {device.serial_number}: {e}",
                            exc_info=True,
                        )

        except asyncio.CancelledError:
            logger.info("[SDKPoll] Worker cancelled")
            break
        except Exception as e:
            logger.error(f"[SDKPoll] Worker error: {e}", exc_info=True)
            await asyncio.sleep(10)
