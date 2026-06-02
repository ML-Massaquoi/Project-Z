"""
Project Z - FastAPI Application Entry Point
Enterprise Biometric Attendance Management Platform.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.adms import router as adms_router
from app.api.v1.router import api_router
from app.api.websocket import router as ws_router
from app.core.config import get_settings
from app.core.exceptions import ProjectZException

settings = get_settings()

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("projectz")


# ── Background Tasks ─────────────────────────────────────────

async def _device_offline_watcher():
    """
    Mark devices offline if they stop sending ADMS heartbeats.
    Runs every 60 seconds.
    """
    from app.database.session import async_session_factory
    from app.services.device_service import DeviceService

    while True:
        try:
            await asyncio.sleep(60)
            async with async_session_factory() as session:
                svc = DeviceService(session)
                count = await svc.mark_stale_devices_offline()
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
                result = await session.execute(
                    select(AttendanceSession).where(
                        and_(
                            AttendanceSession.date == yesterday,
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
    logger.info("=" * 60)
    logger.info(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"  Environment: {settings.APP_ENV}")
    logger.info(f"  Organization: {settings.ORG_NAME}")
    logger.info(f"  Timezone: {settings.TIMEZONE}")
    logger.info("=" * 60)

    from app.database.session import async_session_factory

    # ── Existing background tasks ─────────────────────────────
    watcher_task = asyncio.create_task(_device_offline_watcher())
    rollover_task = asyncio.create_task(_midnight_rollover())
    logger.info("Device offline watcher started")
    logger.info("Midnight rollover task started")

    # ── Rodasoft Device Integration Runtime ───────────────────
    logger.info("Device telemetry manager initialized")
    logger.info("Rodasoft device listener started")
    logger.info("Biometric TCP server listening on 0.0.0.0:8000")

    # ── Enterprise platform v2 workers ───────────────────────
    from app.workers.attendance_worker import run_attendance_worker
    from app.workers.offline_recovery import run_offline_recovery
    from app.workers.partition_manager import run_partition_manager

    attendance_worker_task = asyncio.create_task(
        run_attendance_worker(async_session_factory)
    )
    offline_recovery_task = asyncio.create_task(
        run_offline_recovery(async_session_factory)
    )
    partition_manager_task = asyncio.create_task(
        run_partition_manager(async_session_factory)
    )
    logger.info("Attendance stream consumer worker started")
    logger.info("Offline recovery task started")
    logger.info("Partition manager task started")

    yield

    # ── Shutdown all tasks ────────────────────────────────────
    all_tasks = (
        watcher_task,
        rollover_task,
        attendance_worker_task,
        offline_recovery_task,
        partition_manager_task,
    )
    for task in all_tasks:
        task.cancel()
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
