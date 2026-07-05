"""
Project Z - FastAPI Application Entry Point
Enterprise Biometric Attendance Management Platform.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta, date

import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.api.v1.adms import router as adms_router
from app.api.v1.router import api_router
from app.api.websocket import router as ws_router
from app.core.config import get_settings
from app.core.exceptions import ProjectZException

settings = get_settings()

# ── Logging ──────────────────────────────────────────────────
from app.core.logging_config import setup_logging
setup_logging(debug=settings.DEBUG, json_format=settings.is_production)
logger = logging.getLogger("projectz")


# ── Background Tasks ─────────────────────────────────────────

async def _device_offline_watcher():
    """
    Mark devices offline if they stop sending ADMS heartbeats.
    Runs every 60 seconds. Records status transitions with full audit trail.
    """
    from app.database.session import async_session_factory
    from app.services.device_service import DeviceService
    from app.services.device_activity_service import record_status_transition, log_device_activity

    while True:
        try:
            await asyncio.sleep(60)
            async with async_session_factory() as session:
                svc = DeviceService(session)
                count = await svc.mark_stale_devices_offline()

                # Record status transitions for newly offline devices
                if count:
                    from sqlalchemy import select, and_
                    from app.models.device import Device
                    from datetime import datetime, timezone, timedelta
                    now = datetime.now(timezone.utc)
                    # Devices that just went offline (last_seen > 5 min ago)
                    stale_threshold = now - timedelta(seconds=300)
                    result = await session.execute(
                        select(Device).where(
                            and_(
                                Device.is_active == True,
                                Device.is_online == False,
                                Device.last_seen < stale_threshold,
                            )
                        )
                    )
                    for device in result.scalars().all():
                        await record_status_transition(
                            device_id=device.id,
                            new_status="disconnected",
                            ip_address=device.ip_address,
                            device_name=device.name,
                            reason="heartbeat_timeout",
                            db=session,
                        )
                        await log_device_activity(
                            device_id=device.id,
                            activity_type="device_disconnected",
                            details={"reason": "heartbeat_timeout"},
                            ip_address=device.ip_address,
                            db=session,
                        )

                await session.commit()
                if count:
                    logger.info(f"Offline watcher: marked {count} device(s) offline")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Offline watcher error: {e}", exc_info=True)


async def _midnight_rollover():
    """
    Daily midnight task — runs at 00:00 UTC every day.

    What it does:
    1. Auto-closes any open attendance sessions from the previous day
       (employees who checked in but never checked out — marks them as
       incomplete with AUTO_CHECKOUT_HOURS duration).
    2. Broadcasts a 'day.rollover' WebSocket event so the dashboard
       refreshes its stats for the new day.

    This ensures 'Present Today', 'Late Today', 'Absent Today' always
    reflect the CURRENT calendar day, not yesterday's data.
    """
    from app.database.session import async_session_factory
    from app.models.attendance import AttendanceSession, AttendanceStatus
    from app.services.websocket_service import ws_manager
    from sqlalchemy import select, update, and_
    from sqlalchemy import func

    while True:
        try:
            # ── Calculate seconds until next midnight UTC ─────
            now = datetime.now(timezone.utc)
            tomorrow_midnight = (now + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            sleep_seconds = (tomorrow_midnight - now).total_seconds()

            logger.info(
                f"Midnight rollover: next run in "
                f"{int(sleep_seconds // 3600)}h "
                f"{int((sleep_seconds % 3600) // 60)}m"
            )
            await asyncio.sleep(sleep_seconds)

            # ── It's midnight — run rollover ──────────────────
            yesterday = (datetime.now(timezone.utc) - timedelta(seconds=1)).date()
            logger.info(f"=== MIDNIGHT ROLLOVER for {yesterday} ===")

            async with async_session_factory() as session:
                # Find all open (incomplete) sessions from yesterday
                # Use shift_date for the unique constraint check
                result = await session.execute(
                    select(AttendanceSession).where(
                        and_(
                            AttendanceSession.shift_date == yesterday,
                            AttendanceSession.is_complete == False,
                            AttendanceSession.check_in.isnot(None),
                        )
                    )
                )
                open_sessions = result.scalars().all()

                auto_closed = 0
                for s in open_sessions:
                    # Auto-checkout: set check_out to check_in + AUTO_CHECKOUT_HOURS
                    auto_checkout = s.check_in + timedelta(
                        hours=settings.AUTO_CHECKOUT_HOURS
                    )
                    duration = (auto_checkout - s.check_in).total_seconds() / 60

                    await session.execute(
                        update(AttendanceSession)
                        .where(AttendanceSession.id == s.id)
                        .values(
                            check_out=auto_checkout,
                            duration_minutes=duration,
                            is_complete=True,
                            notes="Auto-closed at midnight rollover",
                        )
                    )
                    auto_closed += 1

                await session.commit()

                if auto_closed:
                    logger.info(
                        f"Midnight rollover: auto-closed {auto_closed} "
                        f"open session(s) from {yesterday}"
                    )

            # Broadcast to all connected dashboards — triggers React Query refetch
            from app.services.websocket_service import ws_manager
            today = datetime.now(timezone.utc).date()
            await ws_manager.broadcast("day.rollover", {
                "previous_date": str(yesterday),
                "new_date": str(today),
                "auto_closed_sessions": auto_closed,
            })
            logger.info(f"=== ROLLOVER COMPLETE — new day: {today} ===")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Midnight rollover error: {e}", exc_info=True)
            # Don't crash — sleep 1 hour and retry
            await asyncio.sleep(3600)


# ── Lifespan ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    import socket
    import platform

    logger.info("=" * 70)
    logger.info(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"  Environment: {settings.APP_ENV}")
    logger.info(f"  Organization: {settings.ORG_NAME}")
    logger.info(f"  Timezone: {settings.TIMEZONE}")
    logger.info("=" * 70)

    # ── Network Diagnostics ────────────────────────────────────
    hostname = socket.gethostname()
    logger.info("")
    logger.info("=" * 70)
    logger.info("  NETWORK DIAGNOSTICS")
    logger.info("=" * 70)
    logger.info(f"  Hostname:       {hostname}")
    logger.info(f"  Platform:       {platform.platform()}")

    # Enumerate all network interfaces
    try:
        import subprocess
        result = subprocess.run(
            ["ipconfig"],
            capture_output=True, text=True, timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if "IPv4" in line and "172.16" in line:
                ip = line.split(":")[-1].strip()
                logger.info(f"  LAN IP:         {ip}")
            elif "IPv4" in line and not "127.0.0" in line and "Media" not in line:
                ip = line.split(":")[-1].strip()
                logger.info(f"  Other IP:       {ip}")
    except Exception:
        # Fallback: just get the primary IP
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
            s.close()
            logger.info(f"  Primary IP:     {primary_ip}")
        except Exception:
            logger.warning("  Could not determine IP address")

    logger.info(f"  Backend Port:   8000")
    logger.info(f"  ADMS Port:      8081 (portproxy → 8000)")
    logger.info(f"  Frontend Port:  3000 (Vite dev server)")

    # ── Registered Routes ──────────────────────────────────────
    logger.info("")
    logger.info("=" * 70)
    logger.info("  REGISTERED ADMS ROUTES")
    logger.info("=" * 70)
    adms_routes = [
        ("GET",  "/iclock/cdata",       "Device handshake / options"),
        ("GET",  "/iclock/getrequest",   "Device heartbeat / command poll"),
        ("POST", "/iclock/cdata",        "Attendance data push"),
        ("POST", "/iclock/devicecmd",    "Device command ack"),
        ("POST", "/adms/test-scan",      "Test scan (diagnostics)"),
        ("GET",  "/adms/status",         "ADMS connection status"),
    ]
    for method, path, desc in adms_routes:
        logger.info(f"  {method:6s} {path:30s}  {desc}")

    logger.info("")
    logger.info("=" * 70)
    logger.info("  DEVICE CONNECTIVITY")
    logger.info("=" * 70)
    logger.info(f"  Device must be configured to push to:")
    logger.info(f"    Server IP:   172.16.40.19")
    logger.info(f"    ADMS Port:   8081")
    logger.info(f"    Protocol:    HTTP")
    logger.info(f"    Push Path:   /iclock/cdata?SN=<serial>&table=ATTLOG")
    logger.info(f"    Heartbeat:   /iclock/getrequest?SN=<serial>")
    logger.info("")
    logger.info(f"  Portproxy rule: 0.0.0.0:8081 → 127.0.0.1:8000")
    logger.info("=" * 70)
    logger.info("")

    from app.database.session import async_session_factory

    # ── Existing background tasks ─────────────────────────────
    watcher_task = asyncio.create_task(_device_offline_watcher())
    rollover_task = asyncio.create_task(_midnight_rollover())
    logger.info("Device offline watcher started")
    logger.info("Midnight rollover task started")

    # ── Enterprise platform v2 workers ───────────────────────
    from app.workers.attendance_worker import run_attendance_worker
    from app.workers.offline_recovery import run_offline_recovery
    from app.workers.partition_manager import run_partition_manager
    from app.workers.device_user_sync import run_device_user_sync_worker
    from app.workers.sdk_polling_worker import run_sdk_polling_worker
    from app.workers.auto_absent import run_auto_absent_worker
    from app.workers.alert_worker import run_alert_worker
    from app.workers.device_health_worker import run_device_health_worker
    from app.workers.data_integrity_worker import run_data_integrity_worker
    from app.workers.backup_worker import run_backup_worker
    from app.workers.device_sync_worker import run_device_sync_worker
    from app.workers.offline_sync_worker import offline_sync_worker

    # Worker definitions: (name, coroutine_factory, restart_delay)
    workers = [
        ("attendance_worker", lambda: run_attendance_worker(async_session_factory), 5),
        ("offline_recovery", lambda: run_offline_recovery(async_session_factory), 10),
        ("partition_manager", lambda: run_partition_manager(async_session_factory), 30),
        ("device_user_sync", lambda: run_device_user_sync_worker(async_session_factory), 15),
        ("sdk_polling", lambda: run_sdk_polling_worker(async_session_factory), 5),
        ("auto_absent", lambda: run_auto_absent_worker(async_session_factory), 10),
        ("alert_worker", lambda: run_alert_worker(async_session_factory), 15),
        ("device_health_worker", lambda: run_device_health_worker(async_session_factory), 15),
        ("data_integrity_worker", lambda: run_data_integrity_worker(async_session_factory), 30),
        ("backup_worker", lambda: run_backup_worker(async_session_factory), 30),
        ("device_sync_worker", lambda: run_device_sync_worker(async_session_factory), 15),
        ("offline_sync_worker", lambda: offline_sync_worker(), 30),
    ]

    # Store worker tasks for shutdown
    worker_tasks: list[asyncio.Task] = []

    async def _run_worker_with_watchdog(name: str, coro_factory, restart_delay: int):
        """Run a worker with automatic restart on crash."""
        while True:
            task = asyncio.create_task(coro_factory())
            logger.info(f"[Watchdog] Worker '{name}' started")
            try:
                await task
                # If task completes normally (shouldn't happen for workers), log and restart
                logger.warning(f"[Watchdog] Worker '{name}' completed unexpectedly, restarting in {restart_delay}s")
            except asyncio.CancelledError:
                logger.info(f"[Watchdog] Worker '{name}' cancelled")
                return  # Don't restart on cancellation
            except Exception as e:
                logger.error(f"[Watchdog] Worker '{name}' crashed: {e}", exc_info=True)
            await asyncio.sleep(restart_delay)

    for name, coro_factory, restart_delay in workers:
        worker_task = asyncio.create_task(
            _run_worker_with_watchdog(name, coro_factory, restart_delay)
        )
        worker_tasks.append(worker_task)
        logger.info(f"Worker '{name}' registered with watchdog")

    logger.info(f"All {len(workers)} workers started with watchdog monitoring")

    yield

    # ── Shutdown all tasks ────────────────────────────────────
    all_tasks = (
        watcher_task,
        rollover_task,
        *worker_tasks,
    )
    for task in all_tasks:
        task.cancel()

    # Shutdown DeviceQueueManager workers
    try:
        from app.services.device_queue_manager import shutdown_all_workers
        await shutdown_all_workers()
    except Exception:
        pass

    for task in all_tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("Project Z shutting down...")


# ── Application ──────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise Real-Time Biometric Attendance Management Platform",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ── Request Logging Middleware ───────────────────────────────
from app.middleware.logging import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# ── Metrics Middleware ───────────────────────────────────────
from app.middleware.metrics import MetricsMiddleware
app.add_middleware(MetricsMiddleware)

# ── Audit Middleware (captures context for mutating requests) ─
from app.middleware.audit import AuditMiddleware
app.add_middleware(AuditMiddleware)

# ── Rate Limiting Middleware ────────────────────────────────
from app.middleware.rate_limit import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL)

# ── CORS Middleware ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception Handlers ──────────────────────────────────────
@app.exception_handler(ProjectZException)
async def projectz_exception_handler(request: Request, exc: ProjectZException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.message,
            "detail": exc.detail,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "detail": str(exc) if settings.DEBUG else None,
        },
    )


# ── Routers ──────────────────────────────────────────────────
# ADMS receiver at root level — devices push to /iclock/cdata (NOT under /api/v1)
app.include_router(adms_router)

# REST API v1
app.include_router(api_router)

# WebSocket
app.include_router(ws_router)


# ── Root ─────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "organization": settings.ORG_NAME,
        "status": "operational",
    }


# ── Health Check ────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Comprehensive health check for load balancers and Docker HEALTHCHECK.
    Returns service status, database connectivity, Redis connectivity.
    """
    import time
    from app.database.session import async_session_factory
    import redis.asyncio as aioredis

    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": settings.APP_VERSION,
        "checks": {},
    }

    # Database check
    try:
        start = time.monotonic()
        async with async_session_factory() as session:
            await session.execute(sa.text("SELECT 1"))
        db_ms = round((time.monotonic() - start) * 1000, 1)
        health["checks"]["database"] = {
            "status": "healthy",
            "latency_ms": db_ms,
        }
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["database"] = {
            "status": "unhealthy",
            "error": str(e),
        }

    # Redis check
    try:
        start = time.monotonic()
        redis_client = aioredis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        await redis_client.aclose()
        redis_ms = round((time.monotonic() - start) * 1000, 1)
        health["checks"]["redis"] = {
            "status": "healthy",
            "latency_ms": redis_ms,
        }
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["redis"] = {
            "status": "unhealthy",
            "error": str(e),
        }

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)


# ── Metrics ─────────────────────────────────────────────────
@app.get("/metrics", tags=["Metrics"])
async def metrics():
    """
    Comprehensive system metrics including request stats, device/employee counts,
    and request metrics (latency, error rates, endpoint breakdown).
    """
    from app.database.session import async_session_factory
    from app.models.device import Device
    from app.models.employee import Employee
    from app.models.attendance import AttendanceSession
    from app.models.user import User
    from app.core.metrics import metrics as request_metrics

    try:
        async with async_session_factory() as session:
            device_count = (await session.execute(sa.func.count(Device.id))).scalar() or 0
            employee_count = (await session.execute(sa.func.count(Employee.id))).scalar() or 0
            today_sessions = (await session.execute(
                sa.select(sa.func.count(AttendanceSession.id))
                .where(AttendanceSession.date == date.today())
            )).scalar() or 0
            user_count = (await session.execute(sa.func.count(User.id))).scalar() or 0

            online_devices = (await session.execute(
                sa.select(sa.func.count(Device.id))
                .where(Device.is_online == True)
            )).scalar() or 0

        # Merge request metrics snapshot
        request_snapshot = request_metrics.get_snapshot()

        return {
            "devices": {
                "total": device_count,
                "online": online_devices,
                "offline": device_count - online_devices,
            },
            "employees": {
                "total": employee_count,
            },
            "attendance": {
                "today_sessions": today_sessions,
            },
            "users": {
                "total": user_count,
            },
            "requests": request_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return JSONResponse(
            content={"error": "Failed to fetch metrics", "detail": str(e)},
            status_code=500,
        )


@app.get("/metrics/prometheus", tags=["Metrics"])
async def metrics_prometheus():
    """
    Prometheus-compatible metrics endpoint.
    Returns metrics in OpenMetrics text format for scraping.
    """
    from app.core.metrics import metrics as request_metrics
    return Response(
        content=request_metrics.get_prometheus_text(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
