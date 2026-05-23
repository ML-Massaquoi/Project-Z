"""
Project Z - ADMS Attendance Receiver
Handles ZKTeco ADMS HTTP push protocol.

Endpoints:
  GET  /iclock/cdata  → Device handshake (options request)
  POST /iclock/cdata  → Attendance data push
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.attendance import RawAttendancePayload
from app.repositories.attendance import RawPayloadRepository
from app.repositories.employee import EmployeeRepository
from app.services.attendance_engine import AttendanceEngine
from app.services.device_service import DeviceService
from app.services.websocket_service import ws_manager
from app.utils.adms_parser import (
    generate_adms_options_response,
    map_punch_status,
    map_verify_type,
    parse_adms_attlog,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ADMS"])


@router.get("/iclock/cdata")
async def adms_handshake(
    SN: Optional[str] = None,
    options: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle ADMS device handshake/options request.

    When a ZKTeco device boots or reconnects, it sends:
    GET /iclock/cdata?SN={serial}&options=all

    We respond with configuration telling the device to push attendance data.
    """
    if not SN:
        return Response(content="ERROR: No serial number", media_type="text/plain")

    logger.info(f"ADMS Handshake from device: SN={SN}")

    # Auto-register/update device
    client_ip = request.client.host if request.client else None
    device_service = DeviceService(db)
    await device_service.handle_device_connection(SN, client_ip)

    # Broadcast device online status
    await ws_manager.broadcast("device.status", {
        "serial_number": SN,
        "status": "online",
        "ip_address": client_ip,
    })

    response_text = generate_adms_options_response(SN)
    return Response(content=response_text, media_type="text/plain")


@router.post("/iclock/cdata")
async def adms_receive_attendance(
    SN: Optional[str] = None,
    table: Optional[str] = None,
    Stamp: Optional[str] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive attendance data pushed by ZKTeco ADMS devices.

    Device sends:
    POST /iclock/cdata?SN={serial}&table=ATTLOG&Stamp={timestamp}

    Body contains tab-separated attendance records.
    """
    body = await request.body()
    body_str = body.decode("utf-8", errors="replace")
    client_ip = request.client.host if request.client else None

    logger.info(
        f"ADMS Data received: SN={SN}, table={table}, Stamp={Stamp}, "
        f"body_length={len(body_str)}"
    )

    if not SN:
        return Response(content="OK", media_type="text/plain")

    # ── 1. Store raw payload ──────────────────────────────
    raw_repo = RawPayloadRepository(db)
    raw_payload = await raw_repo.create({
        "device_serial": SN,
        "payload": body_str,
        "source_ip": client_ip,
        "table_name": table,
        "stamp": Stamp,
        "processed": False,
        "records_count": 0,
    })

    # ── 2. Update device status ───────────────────────────
    device_service = DeviceService(db)
    device = await device_service.handle_device_connection(SN, client_ip)

    # ── 3. Process attendance records ─────────────────────
    if table == "ATTLOG" and body_str.strip():
        records = parse_adms_attlog(body_str)

        if records:
            engine = AttendanceEngine(db)
            employee_repo = EmployeeRepository(db)
            processed_count = 0

            for record in records:
                try:
                    # Map device user ID to employee
                    employee = await employee_repo.get_by_device_user_id(
                        record.user_id,
                        device.id if device else None,
                    )

                    if not employee:
                        logger.warning(
                            f"ADMS: Unknown device user '{record.user_id}' "
                            f"from device {SN}"
                        )
                        continue

                    # Process through attendance engine
                    event = await engine.process_attendance_event(
                        employee_id=employee.id,
                        device_id=device.id if device else None,
                        timestamp=record.timestamp,
                        verify_type=map_verify_type(record.verify_type),
                        punch_status=record.status,
                        device_user_id=record.user_id,
                        work_code=record.work_code,
                    )

                    if event:
                        # Add employee info for WebSocket broadcast
                        event["employee_name"] = employee.full_name
                        event["employee_code"] = employee.employee_code
                        event["device_serial"] = SN
                        event["device_name"] = device.name if device else None

                        # Broadcast real-time event
                        ws_event = (
                            "employee.checked_in"
                            if event["direction"] == "in"
                            else "employee.checked_out"
                        )
                        await ws_manager.broadcast(ws_event, event)
                        await ws_manager.broadcast("attendance.created", event)

                        # Alert if late
                        if event.get("late_minutes", 0) > 0:
                            await ws_manager.broadcast("alert.late_employee", {
                                "employee_name": employee.full_name,
                                "employee_code": employee.employee_code,
                                "late_minutes": event["late_minutes"],
                            })

                        processed_count += 1

                except Exception as e:
                    logger.error(
                        f"ADMS: Error processing record for user "
                        f"'{record.user_id}': {e}"
                    )

            # Update raw payload status
            await raw_repo.update(raw_payload.id, {
                "processed": True,
                "records_count": processed_count,
            })

            logger.info(
                f"ADMS: Processed {processed_count}/{len(records)} records "
                f"from device {SN}"
            )

    # ZKTeco expects "OK" response
    return Response(content="OK", media_type="text/plain")
