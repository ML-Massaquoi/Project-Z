"""
Import fingerprint templates from device into database.

Run: python -m scripts.import_fingerprints
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, and_, func
from app.database.session import async_session_factory
from app.models.device import Device
from app.models.employee import Employee
from app.models.employee_device_mapping import EmployeeDeviceMapping
from app.models.fingerprint_template import FingerprintTemplate
from app.services.sdk_service import ZKSDKService

# pyzk finger index mapping
FINGER_NAMES = {
    0: "Right Thumb",
    1: "Right Index",
    2: "Right Middle",
    3: "Right Ring",
    4: "Right Little",
    5: "Left Thumb",
    6: "Left Index",
    7: "Left Middle",
    8: "Left Ring",
    9: "Left Little",
}


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

        print(f"Device: {device.name} ({device.serial_number})")

        # Get device mappings
        mappings_result = await db.execute(
            select(EmployeeDeviceMapping).where(EmployeeDeviceMapping.device_id == device.id)
        )
        mappings = {m.device_user_id: m for m in mappings_result.scalars().all()}
        print(f"Device mappings: {len(mappings)}")

        # Connect to device and fetch templates
        print("Connecting to device via TCP SDK...")
        from zk import ZK
        zk = ZK(device.ip_address, port=device.sdk_port or 4370, timeout=10, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()

        try:
            conn.disable_device()

            # Get all users with their template info
            users = conn.get_users()
            print(f"Users on device: {len(users)}")

            # Get templates
            templates = conn.get_templates()
            print(f"Templates on device: {len(templates)}")

            conn.enable_device()
        finally:
            conn.disconnect()

        # Process templates
        created = 0
        skipped = 0
        errors = 0

        # Process templates - track inserted keys in memory to avoid duplicate DB queries
        inserted_keys = set()
        batch_count = 0

        for t in templates:
            try:
                uid = str(t.uid)
                fid = t.fid
                size = t.size
                valid = t.valid

                # Find employee mapping
                mapping = mappings.get(uid)
                if not mapping:
                    skipped += 1
                    continue

                # Check in-memory set (avoids DB query per template)
                key = (str(mapping.employee_id), str(device.id), fid)
                if key in inserted_keys:
                    skipped += 1
                    continue

                # Create template record
                tmpl = FingerprintTemplate(
                    employee_id=mapping.employee_id,
                    device_id=device.id,
                    device_user_id=uid,
                    finger_index=fid,
                    template_size=size,
                    quality=valid,
                )
                db.add(tmpl)
                inserted_keys.add(key)
                created += 1
                batch_count += 1

                # Flush every 100 templates
                if batch_count >= 100:
                    await db.flush()
                    batch_count = 0

            except Exception as e:
                errors += 1
                print(f"  Error: {e}")

        await db.commit()

        # Summary per employee
        result = await db.execute(
            select(FingerprintTemplate.employee_id, func.count(FingerprintTemplate.id))
            .group_by(FingerprintTemplate.employee_id)
        )
        per_emp = result.all()

        print(f"\n{'='*50}")
        print(f"FINGERPRINT IMPORT COMPLETE")
        print(f"  Templates created:  {created}")
        print(f"  Skipped (existing): {skipped}")
        print(f"  Errors:             {errors}")
        print(f"  Employees with FP:  {len(per_emp)}")
        print(f"{'='*50}")

        # Show employees with most fingerprints
        emp_ids = [row[0] for row in sorted(per_emp, key=lambda r: r[1], reverse=True)[:10]]
        for emp_id in emp_ids:
            count = next(r[1] for r in per_emp if r[0] == emp_id)
            emp_result = await db.execute(select(Employee).where(Employee.id == emp_id))
            emp = emp_result.scalar_one_or_none()
            if emp:
                print(f"  {emp.full_name} ({emp.employee_code}): {count} fingerprints")

asyncio.run(main())
