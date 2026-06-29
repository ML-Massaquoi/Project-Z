"""
Bulk assign departments to employees based on naming patterns.
Run: python -m scripts.assign_departments
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from app.database.session import async_session_factory
from app.models.employee import Employee
from app.models.department import Department


# Department assignment rules based on employee name patterns
# Add your own rules here based on your airport's department structure
DEPT_RULES = {
    # Department name keyword → Department name in DB
    # These are examples — adjust to match your actual departments
    "management": "Management",
    "admin": "Administration",
    "hr": "Human Resources",
    "human resource": "Human Resources",
    "finance": "Finance",
    "account": "Finance",
    "ict": "ICT",
    "it": "ICT",
    "information": "ICT",
    "technical": "Technical",
    "engineering": "Technical",
    "security": "Security",
    "safety": "Safety",
    "operations": "Operations",
    "operations": "Operations",
    "terminal": "Terminal Operations",
    "ground": "Ground Handling",
    "cargo": "Cargo",
    "commercial": "Commercial",
    "marketing": "Commercial",
    "legal": "Legal",
    "procurement": "Procurement",
    "logistics": "Logistics",
    "maintenance": "Maintenance",
    "cleaning": "Facilities",
    "facilities": "Facilities",
}


async def main():
    async with async_session_factory() as db:
        # Get all departments
        dept_result = await db.execute(select(Department))
        departments = {d.name.lower(): d for d in dept_result.scalars().all()}
        print(f"Found {len(departments)} departments: {list(departments.keys())}")

        # Get all employees with no department
        emp_result = await db.execute(
            select(Employee).where(Employee.department_id.is_(None))
        )
        unassigned = emp_result.scalars().all()
        print(f"Found {len(unassigned)} unassigned employees")

        assigned = 0
        for emp in unassigned:
            name_lower = emp.full_name.lower()
            dept_name = None

            # Try to match by name pattern
            for keyword, target_dept in DEPT_RULES.items():
                if keyword in name_lower:
                    dept_name = target_dept
                    break

            if dept_name and dept_name.lower() in departments:
                dept = departments[dept_name.lower()]
                await db.execute(
                    update(Employee)
                    .where(Employee.id == emp.id)
                    .values(department_id=dept.id)
                )
                assigned += 1
                print(f"  {emp.full_name} → {dept.name}")
            else:
                # Default to first department if no match
                default_dept = list(departments.values())[0] if departments else None
                if default_dept:
                    await db.execute(
                        update(Employee)
                        .where(Employee.id == emp.id)
                        .values(department_id=default_dept.id)
                    )
                    assigned += 1
                    print(f"  {emp.full_name} → {default_dept.name} (default)")

        await db.commit()
        print(f"\nAssigned {assigned} employees to departments")


if __name__ == "__main__":
    asyncio.run(main())
