"""
Project Z - FastAPI Application Entry Point
Enterprise Biometric Attendance Management Platform.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

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
    Background task: mark devices offline if they stop sending ADMS heartbeats.
    Runs every 60 seconds. A device is considered offline if last_seen is older
    than OFFLINE_THRESHOLD_MINUTES (defined in DeviceService).
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

    watcher_task = asyncio.create_task(_device_offline_watcher())
    logger.info("Device offline watcher started")

    yield

    watcher_task.cancel()
    try:
        await watcher_task
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
