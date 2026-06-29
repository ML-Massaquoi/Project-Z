"""
One-time script: Import all users from device 5870203560313
Creates employees + device_mappings so scans resolve to real people.

Run: python -m scripts.import_device_users
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import async_session_factory
from app.models.device import Device
from app.models.employee import Employee, EmployeeStatus
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.department import Department
from app.services.sdk_service import ZKSDKService


async def main():
    async with async_session_factory() as db:
        # Find the real device
        result = await db.execute(
            select(Device).where(Device.serial_number == "5870203560313")
        )
        device = result.scalar_one_or_none()
        if not device:
            print("ERROR: Device 5870203560313 not found")
            return

        print(f"Device: {device.name} ({device.serial_number}) IP={device.ip_address}")

        # Fetch users from device via SDK
        print("Fetching users from device via TCP SDK...")
        sdk = ZKSDKService(ip=device.ip_address, port=device.sdk_port or 4370)
        device_users = sdk.get_users()
        print(f"Found {len(device_users)} users on device")

        # Get or create a default department
        dept_result = await db.execute(select(Department).order_by(Department.name).limit(1))
        default_dept = dept_result.scalar_one_or_none()
        if not default_dept:
            print("ERROR: No departments exist. Create one first.")
            return

        print(f"Default department: {default_dept.name}")

        created_employees = 0
        created_mappings = 0
        skipped = 0

        for u in device_users:
            uid = str(u.get("user_id", ""))
            name = u.get("name", "").strip()

            if not uid or not name:
                skipped += 1
                continue

            # Check if mapping already exists
            existing_mapping = await db.execute(
                select(EmployeeDeviceMapping).where(
                    and_(
                        EmployeeDeviceMapping.device_id == device.id,
                        EmployeeDeviceMapping.device_user_id == uid,
                    )
                )
            )
            if existing_mapping.scalar_one_or_none():
                skipped += 1
                continue

            # Check if employee exists by name
            emp_result = await db.execute(
                select(Employee).where(
                    Employee.full_name.ilike(name)
                ).limit(1)
            )
            employee = emp_result.scalar_one_or_none()

            if not employee:
                # Create new employee
                emp_code = f"EMP-{uid.zfill(4)}"
                # Ensure unique code
                code_check = await db.execute(
                    select(Employee).where(Employee.employee_code == emp_code)
                )
                if code_check.scalar_one_or_none():
                    emp_code = f"EMP-{uid}-{device.serial_number[-4:]}"

                employee = Employee(
                    employee_code=emp_code,
                    full_name=name,
                    department_id=default_dept.id,
                    status=EmployeeStatus.ACTIVE,
                )
                db.add(employee)
                await db.flush()
                await db.refresh(employee)
                created_employees += 1

            # Create device mapping
            mapping = EmployeeDeviceMapping(
                employee_id=employee.id,
                device_id=device.id,
                device_user_id=uid,
            )
            db.add(mapping)
            created_mappings += 1

        await db.commit()

        print(f"\n{'='*50}")
        print(f"IMPORT COMPLETE")
        print(f"  Users on device:    {len(device_users)}")
        print(f"  Employees created:  {created_employees}")
        print(f"  Mappings created:   {created_mappings}")
        print(f"  Skipped (existing): {skipped}")
        print(f"{'='*50}")
        print(f"\nScans will now resolve to real employees.")


if __name__ == "__main__":
    asyncio.run(main())
