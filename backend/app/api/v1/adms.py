"""
Project Z - ADMS Attendance Receiver
Handles ZKTeco / RONASOFT ADMS HTTP push protocol.

Protocol flow:
  1. Device boots → GET /iclock/cdata?SN=xxx&options=all   (handshake)
  2. Server responds with config (Realtime=1, TransFlag, etc.)
  3. Device polls → GET /iclock/getrequest?SN=xxx          (command poll)
  4. Server responds "OK" (no pending commands)
  5. Device pushes → POST /iclock/cdata?SN=xxx&table=ATTLOG (attendance data)
  6. Server responds "OK" — always, within 500ms

Layer 1 pipeline (per design):
  ADMS push → IngestionService.ingest() → respond "OK"
  IngestionService handles: store scan_event → broadcast WS → enqueue Redis stream

Diagnostic:
  GET /adms/status  → JSON status of all connected devices
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.database.session import get_db
from app.models.device import Device
from app.models.scan_event import ScanEvent, ProcessingStatusV2
from app.repositories.device import DeviceRepository
from app.services.device_service import DeviceService
from app.services.websocket_service import ws_manager
from app.utils.adms_parser import (
    generate_adms_options_response,
    map_verify_type,
    parse_adms_attlog,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ADMS"])
settings = get_settings()

# Throttle: only write last_seen to DB every 30s per device (getrequest fires ~1/sec)
_last_seen_cache: dict[str, float] = {}
_last_options_refresh: dict[str, float] = {}
_LAST_SEEN_WRITE_INTERVAL = 30  # seconds
_OPTIONS_REFRESH_INTERVAL = 3600  # send OPTIONS command to force re-read every hour


def _get_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


async def _validate_device_ip(db: AsyncSession, serial_number: str, client_ip: str) -> bool:
    """
    Validate that the client IP matches the registered device IP.
    Returns True if valid or if device has no registered IP (first connection).
    """
    if not client_ip:
        return False

    # Allow localhost for development
    if settings.DEBUG and client_ip in ("127.0.0.1", "::1", "localhost"):
        return True

    result = await db.execute(
        select(Device).where(Device.serial_number == serial_number)
    )
    device = result.scalar_one_or_none()

    if not device:
        # Unknown device — allow first connection, will be auto-registered
        return True

    if not device.ip_address:
        # Device has no registered IP yet — allow and update
        return True

    if device.ip_address == client_ip:
        return True

    # IP mismatch — log but allow (devices may get new IPs via DHCP)
    logger.warning(
        f"[ADMS] IP mismatch for {serial_number}: "
        f"expected={device.ip_address} got={client_ip}"
    )
    return True


# ── Diagnostic endpoint ───────────────────────────────────────

@router.get("/adms/status", tags=["ADMS"])
async def adms_connection_status(db: AsyncSession = Depends(get_db)):
    """
    Diagnostic: live connection status of all ADMS devices.
    """
    result = await db.execute(
        select(Device).order_by(Device.last_seen.desc().nullslast())
    )
    devices = result.scalars().all()

    from sqlalchemy import func, and_
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    device_list = []
    for d in devices:
        pc = (await db.execute(
            select(func.count()).select_from(ScanEvent)
            .where(ScanEvent.device_serial == d.serial_number)
            .where(ScanEvent.scan_timestamp >= cutoff)
        )).scalar_one()

        device_list.append({
            "id": str(d.id),
            "serial_number": d.serial_number,
            "name": d.name,
            "ip_address": d.ip_address,
            "is_online": d.is_online,
            "is_active": d.is_active,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            "last_activity": d.last_activity,
            "scans_last_24h": pc,
        })

    return {
        "server": "Project Z ADMS Receiver",
        "endpoints": {
            "handshake": "GET  /iclock/cdata?SN={serial}&options=all",
            "command_poll": "GET  /iclock/getrequest?SN={serial}",
            "data_push": "POST /iclock/cdata?SN={serial}&table=ATTLOG",
        },
        "devices": device_list,
        "total_devices": len(device_list),
        "online_devices": sum(1 for d in devices if d.is_online),
    }


# ── Device command acknowledgement ────────────────────────────

@router.post("/iclock/devicecmd")
async def adms_devicecmd(
    SN: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle device command acknowledgement."""
    body = await request.body()
    body_str = body.decode("utf-8", errors="replace").strip()
    logger.info(f"[ADMS] Device cmd ack | SN={SN} | body={body_str[:200]}")
    return Response(content="OK", media_type="text/plain")


# ── Command polling (throttled) ───────────────────────────────

@router.get("/iclock/getrequest")
async def adms_getrequest(
    SN: Optional[str] = None,
    INFO: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle RONASOFT/ZKTeco device command polling (~1/sec).
    Throttled DB write: only updates last_seen every 30s per device.
    Resilient: always returns OK even if DB is temporarily unavailable.
    """
    client_ip = _get_client_ip(request)

    if not SN:
        return Response(content="OK", media_type="text/plain")

    # Log every heartbeat at INFO with status 200 (green in ColorFormatter)
    logger.info(f"[HEARTBEAT] [200] SN={SN}  IP={client_ip}  status=OK")

    now = time.time()
    last_write = _last_seen_cache.get(SN, 0)
    if now - last_write >= _LAST_SEEN_WRITE_INTERVAL:
        _last_seen_cache[SN] = now

        # Try DB update, but don't fail if DB is unavailable
        try:
            device_service = DeviceService(db)
            await device_service.handle_device_connection(SN, client_ip)

            # Log heartbeat activity and record online status
            from sqlalchemy import select
            from app.models.device import Device
            from app.services.device_activity_service import log_device_activity, record_status_transition
            device_result = await db.execute(select(Device).where(Device.serial_number == SN))
            device = device_result.scalar_one_or_none()
            if device:
                await log_device_activity(
                    device_id=device.id,
                    activity_type="heartbeat",
                    ip_address=client_ip,
                    db=db,
                )
                await record_status_transition(
                    device_id=device.id,
                    new_status="online",
                    ip_address=client_ip,
                    device_name=device.name,
                    reason="heartbeat",
                    db=db,
                )
                await db.commit()
        except Exception as e:
            # DB temporarily unavailable — log but don't crash
            logger.warning(f"[HEARTBEAT] DB update skipped for {SN}: {e}")

    from datetime import datetime, timezone
    now_utc = datetime.now(timezone.utc)
    time_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")

    response_lines = ["DUPKICK=0"]

    # Sync device clock on every heartbeat (devices lose time on power loss)
    response_lines.append(f"SETTIME {time_str}")

    # Force options re-read periodically and on reconnect
    now = time.time()
    last_refresh = _last_options_refresh.get(SN, 0)
    if INFO or (now - last_refresh >= _OPTIONS_REFRESH_INTERVAL):
        _last_options_refresh[SN] = now
        response_lines.append("OPTIONS")
        if INFO:
            logger.info(
                f"[ADMS] Device reconnected | SN={SN} | INFO={INFO} | IP={client_ip}"
            )

    response_lines.append("OK")
    return Response(content="\r\n".join(response_lines), media_type="text/plain")


# ── Handshake ─────────────────────────────────────────────────

@router.get("/iclock/cdata")
async def adms_handshake(
    SN: Optional[str] = None,
    options: Optional[str] = None,
    pushver: Optional[str] = None,
    language: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle ADMS device handshake / options request.
    Device sends: GET /iclock/cdata?SN={serial}&options=all&pushver=2.4.0

    Resilient: always returns a valid response even if DB is temporarily unavailable.
    Devices will retry if they don't get a response.
    """
    client_ip = _get_client_ip(request)

    if not SN:
        return Response(content="ERROR: No serial number", media_type="text/plain")

    logger.info(
        f"[ADMS] HANDSHAKE | SN={SN} | options={options} "
        f"| pushver={pushver} | IP={client_ip}"
    )

    # Always update the last-seen cache (in-memory, no DB needed)
    _last_seen_cache[SN] = time.time()

    # Try to update device status in DB, but don't fail if DB is unavailable
    try:
        device_service = DeviceService(db)
        device = await device_service.handle_device_connection(SN, client_ip)

        await ws_manager.broadcast("device_status_update", {
            "serial_number": SN,
            "device_id": str(device.id) if device else None,
            "device_name": device.name or f"Device {SN}" if device else f"Device {SN}",
            "status": "online",
            "ip_address": client_ip,
            "office_name": "Unassigned",
            "department_name": "Unassigned",
        })
    except Exception as e:
        # DB temporarily unavailable — log but don't crash
        # Device will retry and we'll catch it next time
        logger.warning(
            f"[ADMS] Handshake DB update skipped for {SN}: {e}"
        )

    response_text = generate_adms_options_response(SN)
    logger.info(f"[ADMS] Handshake response sent to {SN}")
    return Response(content=response_text, media_type="text/plain")


async def process_adms_attendance_background(SN: str, body_str: str, client_ip: str):
    """Process ADMS attendance records in a background task with a dedicated session."""
    from app.database.session import async_session_factory
    from app.services.device_service import DeviceService
    from app.services.ingestion_service import IngestionService
    from app.utils.adms_parser import parse_adms_attlog
    from app.models.scan_event import ScanResult
    from app.services.device_activity_service import log_device_activity, record_status_transition

    async with async_session_factory() as db:
        try:
            # 1. Update device status
            device_service = DeviceService(db)
            await device_service.handle_device_connection(SN, client_ip)

            # 2. Log the activity
            from sqlalchemy import select
            from app.models.device import Device
            device_result = await db.execute(select(Device).where(Device.serial_number == SN))
            device = device_result.scalar_one_or_none()
            if device:
                await log_device_activity(
                    device_id=device.id,
                    activity_type="attendance_push",
                    details={"records_count": len(body_str.splitlines()), "payload_size": len(body_str)},
                    ip_address=client_ip,
                    db=db,
                )
                await record_status_transition(
                    device_id=device.id,
                    new_status="online",
                    ip_address=client_ip,
                    device_name=device.name,
                    reason="attendance_push_received",
                    db=db,
                )

            # 3. Parse logs
            logger.info(
                f"\n"
                f"{'='*60}\n"
                f"[SCAN RECEIVED]\n"
                f"  Device SN: {SN}\n"
                f"  Source IP: {client_ip}\n"
                f"  Payload Size: {len(body_str)} bytes\n"
                f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"{'='*60}"
            )

            records = parse_adms_attlog(body_str)

            logger.info(
                f"\n"
                f"[SCAN PARSED]\n"
                f"  Device SN: {SN}\n"
                f"  Records Parsed: {len(records)}\n"
                f"{'='*60}"
            )

            for i, rec in enumerate(records[:5]):
                verify_name = map_verify_type(rec.verify_type)
                direction = "IN" if rec.status in (0, 3, 4) else "OUT" if rec.status in (1, 2, 5) else "UNKNOWN"
                logger.info(
                    f"  Record {i+1}: "
                    f"User={rec.user_id} | "
                    f"Time={rec.timestamp} | "
                    f"Direction={direction} | "
                    f"Verify={verify_name} | "
                    f"RawStatus={rec.status}"
                )

            # Persist raw ADMS payload for debugging/audit trail
            try:
                from app.repositories.attendance import RawPayloadRepository

                raw_repo = RawPayloadRepository(db)
                await raw_repo.create({
                    "device_serial": SN,
                    "payload": body_str,
                    "source_ip": client_ip,
                    "table_name": "ATTLOG",
                    "records_count": len(records),
                })
            except Exception as e:
                logger.warning(f"[ADMS-BG] Failed to persist raw payload for {SN}: {e}")

            processed = 0
            unknown_users = set()
            ingestion = IngestionService(db)

            for record in records:
                try:
                    scan_event = await ingestion.ingest(
                        device_serial=SN,
                        device_user_id=record.user_id,
                        scan_timestamp=record.timestamp,
                        verify_type_code=record.verify_type,
                        raw_punch_state=record.status,
                        raw_payload={
                            "user_id": record.user_id,
                            "timestamp": str(record.timestamp),
                            "status": record.status,
                            "verify_type": record.verify_type,
                            "work_code": record.work_code,
                        },
                        source_ip=client_ip,
                    )
                    if scan_event:
                        if scan_event.scan_result == ScanResult.UNKNOWN_USER:
                            unknown_users.add(record.user_id)
                        processed += 1
                except Exception as e:
                    logger.error(
                        f"[ADMS-BG] Error ingesting record user='{record.user_id}': {e}",
                        exc_info=True,
                    )

            if unknown_users:
                logger.warning(
                    f"[ADMS-BG] Unrecognized device user IDs from {SN}: "
                    f"{sorted(unknown_users)} — map them at /unrecognized"
                )

            logger.info(
                f"\n"
                f"[SCAN COMPLETE]\n"
                f"  Device SN: {SN}\n"
                f"  Total Records: {len(records)}\n"
                f"  Processed: {processed}\n"
                f"  Unknown Users: {len(unknown_users)}\n"
                f"  Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"{'='*60}"
            )

            # Commit the session explicitly to persist the changes
            await db.commit()

        except Exception as e:
            logger.error(f"[ADMS-BG] Failed processing batch for SN={SN}: {e}", exc_info=True)
            await db.rollback()


# ── Attendance data push (Layer 1 entry point) ────────────────

@router.post("/iclock/cdata")
async def adms_receive_attendance(
    background_tasks: BackgroundTasks,
    SN: Optional[str] = None,
    table: Optional[str] = None,
    Stamp: Optional[str] = None,
    request: Request = None,
):
    """
    Receive attendance data pushed by RONASOFT/ZKTeco ADMS devices.

    Device sends: POST /iclock/cdata?SN={serial}&table=ATTLOG&Stamp={ts}
    Body: tab-separated attendance records.

    This endpoint MUST respond "OK" within 500ms regardless of downstream state.
    Processing is offloaded to a background task to prevent request timeout/CLOSE_WAIT leaks.
    """
    body = await request.body()
    body_str = body.decode("utf-8", errors="replace")
    client_ip = _get_client_ip(request)

    logger.info(
        f"[ADMS] DATA PUSH | SN={SN} | table={table} | Stamp={Stamp} "
        f"| bytes={len(body_str)} | IP={client_ip}"
    )

    if not SN:
        return Response(content="OK", media_type="text/plain")

    # Update cache
    _last_seen_cache[SN] = time.time()

    # Offload processing if table is ATTLOG and body is not empty
    if table == "ATTLOG" and body_str.strip():
        background_tasks.add_task(
            process_adms_attendance_background,
            SN=SN,
            body_str=body_str,
            client_ip=client_ip,
        )

    # ZKTeco/RONASOFT MUST receive exactly "OK"
    return Response(content="OK", media_type="text/plain")


# ── Test endpoint (simulate scan for diagnostics) ──────────────

@router.post("/adms/test-scan")
async def test_scan(
    SN: str = "TEST-DEVICE",
    user_id: str = "1",
    status: int = 0,
    verify_type: int = 1,
    db: AsyncSession = Depends(get_db),
):
    """
    Test endpoint: simulate a biometric scan for pipeline diagnostics.
    POST /adms/test-scan?SN=TEST-DEVICE&user_id=1&status=0&verify_type=1

    This exercises the full pipeline:
    parse → ingest → WebSocket broadcast → Redis stream → attendance engine
    """
    from datetime import datetime, timezone
    from app.services.ingestion_service import IngestionService
    from app.services.device_service import DeviceService
    from app.models.scan_event import ScanResult

    now = datetime.now(timezone.utc)
    ts_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # Ensure device exists
    device_service = DeviceService(db)
    await device_service.handle_device_connection(SN, "127.0.0.1")

    # Build ADMS-format body
    body_str = f"{user_id}\t{ts_str}\t{status}\t{verify_type}\t0\t0\t0"

    logger.info(
        f"\n"
        f"{'='*60}\n"
        f"[TEST SCAN]\n"
        f"  Device SN: {SN}\n"
        f"  User ID: {user_id}\n"
        f"  Timestamp: {ts_str}\n"
        f"  Status: {status}\n"
        f"  Verify Type: {verify_type}\n"
        f"{'='*60}"
    )

    # Parse
    records = parse_adms_attlog(body_str)
    if not records:
        return {"error": "Failed to parse test scan"}

    # Ingest
    ingestion = IngestionService(db)
    scan_event = await ingestion.ingest(
        device_serial=SN,
        device_user_id=records[0].user_id,
        scan_timestamp=records[0].timestamp,
        verify_type_code=records[0].verify_type,
        raw_punch_state=records[0].status,
        raw_payload={
            "user_id": records[0].user_id,
            "timestamp": str(records[0].timestamp),
            "status": records[0].status,
            "verify_type": records[0].verify_type,
            "work_code": records[0].work_code,
        },
        source_ip="127.0.0.1",
    )

    if scan_event:
        await db.commit()
        return {
            "status": "ok",
            "scan_event_id": str(scan_event.id),
            "employee_code": scan_event.employee_code,
            "scan_result": scan_event.scan_result.value if hasattr(scan_event.scan_result, "value") else str(scan_event.scan_result),
            "timestamp": scan_event.scan_timestamp.isoformat(),
        }
    else:
        await db.rollback()
        return {"error": "Failed to store scan event"}
