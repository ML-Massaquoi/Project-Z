"""
Project Z - API v1 Router Aggregator
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.devices import router as devices_router
from app.api.v1.employees import router as employees_router
from app.api.v1.routes import (
    departments_router,
    offices_router,
    reports_router,
    shifts_router,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(attendance_router)
api_router.include_router(employees_router)
api_router.include_router(devices_router)
api_router.include_router(departments_router)
api_router.include_router(shifts_router)
api_router.include_router(offices_router)
api_router.include_router(reports_router)


@api_router.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "Project Z API", "version": "1.0.0"}
