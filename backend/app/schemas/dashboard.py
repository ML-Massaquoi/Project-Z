"""
Project Z - Dashboard Schemas
"""

from typing import Optional

from pydantic import BaseModel


class DashboardTrends(BaseModel):
    employees_change: float = 0.0
    present_change: float = 0.0
    late_change: float = 0.0
    absent_change: float = 0.0


class DashboardStats(BaseModel):
    total_employees: int = 0
    present_today: int = 0
    late_today: int = 0
    absent_today: int = 0
    active_devices: int = 0
    online_devices: int = 0
    trends: DashboardTrends = DashboardTrends()


class DepartmentAttendance(BaseModel):
    department_name: str
    department_id: str
    count: int
    percentage: float


class AttendanceChartPoint(BaseModel):
    date: str
    present: int = 0
    absent: int = 0
    late: int = 0


class DashboardChartData(BaseModel):
    attendance_overview: list[AttendanceChartPoint] = []
    department_breakdown: list[DepartmentAttendance] = []
