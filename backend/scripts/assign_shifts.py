"""
Bulk assign shifts to employees. Default: Day Shift (08:00-17:00) for all.
Run: python -m scripts.assign_shifts
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from app.database.session import async_session_factory
from app.models.employee import Employee
from app.models.shift import Shift


async def main():
    async with async_session_factory() as db:
        # Get shifts
        shift_result = await db.execute(select(Shift).order_by(Shift.start_time))
        shifts = shift_result.scalars().all()
        print(f"Found {len(shifts)} shifts:")
        for s in shifts:
            print(f"  {s.name} ({s.code}): {s.start_time}-{s.end_time}")

        if not shifts:
            print("ERROR: No shifts found. Create shifts first.")
            return

        # Default to Day Shift or first shift
        day_shift = next((s for s in shifts if s.code == 'DAY'), shifts[0])
        print(f"\nUsing default shift: {day_shift.name} ({day_shift.start_time}-{day_shift.end_time})")

        # Get employees without shifts
        emp_result = await db.execute(
            select(Employee).where(Employee.shift_id.is_(None))
        )
        unassigned = emp_result.scalars().all()
        print(f"Found {len(unassigned)} employees without shifts")

        assigned = 0
        for emp in unassigned:
            await db.execute(
                update(Employee)
                .where(Employee.id == emp.id)
                .values(shift_id=day_shift.id)
            )
            assigned += 1

        await db.commit()
        print(f"Assigned {assigned} employees to {day_shift.name}")


if __name__ == "__main__":
    asyncio.run(main())
