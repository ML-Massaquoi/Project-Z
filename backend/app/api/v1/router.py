"""
Project Z - API v1 Router Aggregator
All routes versioned under /api/v1/
"""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.attendance import router as attendance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.devices import router as devices_router
from app.api.v1.employees import router as employees_router
from app.api.v1.users import router as users_router, roles_router
from app.api.v1.routes import (
    departments_router,
    offices_router,
    reports_router,
    shifts_router,
)
# ── Enterprise platform v2 routers ───────────────────────────
from app.api.v1.scan_events import router as scan_events_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.reports_v2 import router as reports_v2_router
from app.api.v1.leave_requests import router as leave_requests_router
from app.api.v1.shift_templates import router as shift_templates_router
from app.api.v1.dept_shift_rules import router as dept_shift_rules_router
from app.api.v1.shift_assignments import router as shift_assignments_router

api_router = APIRouter(prefix="/api/v1")

# ── Existing routers ──────────────────────────────────────────
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(attendance_router)
api_router.include_router(employees_router)
api_router.include_router(devices_router)
api_router.include_router(departments_router)
api_router.include_router(shifts_router)
api_router.include_router(offices_router)
api_router.include_router(reports_router)
api_router.include_router(users_router)
api_router.include_router(roles_router)

# ── Enterprise platform v2 routers ───────────────────────────
api_router.include_router(scan_events_router)
api_router.include_router(analytics_router)
api_router.include_router(reports_v2_router)
api_router.include_router(leave_requests_router)
api_router.include_router(shift_templates_router)
api_router.include_router(dept_shift_rules_router)
api_router.include_router(shift_assignments_router)


@api_router.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "Project Z API", "version": "2.0.0"}
