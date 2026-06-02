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
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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

# Throttle: only write last_seen to DB every 30s per device (getrequest fires ~1/sec)
_last_seen_cache: dict[str, float] = {}
_LAST_SEEN_WRITE_INTERVAL = 30  # seconds


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
    """
    client_ip = request.client.host if request.client else None
    logger.info(f"Incoming TCP connection from {client_ip}")

    if not SN:
        return Response(content="OK", media_type="text/plain")

    logger.info(f"Heartbeat received from {SN}")
    logger.info(f"Raw device payload received: INFO={INFO or 'Heartbeat'}")

    now = time.time()
    last_write = _last_seen_cache.get(SN, 0)
    if now - last_write >= _LAST_SEEN_WRITE_INTERVAL:
        _last_seen_cache[SN] = now
        device_service = DeviceService(db)
        await device_service.handle_device_connection(SN, client_ip)

    if INFO:
        logger.info(f"[ADMS] Device reconnected | SN={SN} | INFO={INFO} | IP={client_ip}")

    return Response(content="OK", media_type="text/plain")


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
    """
    client_ip = request.client.host if request.client else None
    logger.info(f"Incoming TCP connection from {client_ip}")

    if not SN:
        return Response(content="ERROR: No serial number", media_type="text/plain")

    logger.info(f"Heartbeat received from {SN}")
    logger.info(
        f"[ADMS] *** HANDSHAKE *** | SN={SN} | options={options} "
        f"| pushver={pushver} | IP={client_ip}"
    )

    device_service = DeviceService(db)
    device = await device_service.handle_device_connection(SN, client_ip)
    _last_seen_cache[SN] = time.time()

    await ws_manager.broadcast("device_status_update", {
        "serial_number": SN,
        "device_id": str(device.id) if device else None,
        "device_name": device.name or f"Device {SN}" if device else f"Device {SN}",
        "status": "online",
        "ip_address": client_ip,
        "office_name": "Unassigned",
        "department_name": "Unassigned",
    })

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

    async with async_session_factory() as db:
        try:
            # 1. Update device status
            device_service = DeviceService(db)
            await device_service.handle_device_connection(SN, client_ip)

            # 2. Parse logs
            records = parse_adms_attlog(body_str)
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
            logger.info(f"Incoming TCP connection from {client_ip}")
            logger.info(f"Raw device payload received: {body_str[:300]}")
            logger.info(f"[ADMS-BG] DATA PUSH background processing started | SN={SN} | records={len(records)}")

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
                f"[ADMS-BG] Finished | SN={SN} | ingested={processed}/{len(records)}"
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
    client_ip = request.client.host if request.client else None

    logger.info(f"Incoming TCP connection from {client_ip}")
    logger.info(f"Raw device payload received: {body_str[:300]}")

    logger.info(
        f"[ADMS] DATA PUSH RECEIVED | SN={SN} | table={table} | Stamp={Stamp} "
        f"| bytes={len(body_str)} | IP={client_ip}"
    )

    if body_str.strip():
        logger.info(f"[ADMS] RAW BODY (first 500 chars): {body_str[:500]!r}")

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
