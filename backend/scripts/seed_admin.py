"""
Project Z - Admin Seeder
Seeds the default organization, admin role, and admin user.
Run: python scripts/seed_admin.py
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import get_settings
from app.core.security import hash_password
from app.database.session import async_session_factory, engine
from app.database.base import Base
from app.models import *  # noqa: Import all models

settings = get_settings()


async def seed():
    """Seed default data."""
    async with async_session_factory() as session:
        from sqlalchemy import select

        # ── 1. Create default organization ───────────────────
        existing_org = (await session.execute(
            select(Organization).where(Organization.code == "FIA")
        )).scalar_one_or_none()

        if not existing_org:
            org = Organization(
                name=settings.ORG_NAME,
                code="FIA",
                country=settings.ORG_COUNTRY,
                timezone=settings.TIMEZONE,
                address="Lungi, Sierra Leone",
            )
            session.add(org)
            await session.flush()
            print(f"✓ Created organization: {settings.ORG_NAME}")

            # Create default office
            office = Office(
                name="Main Terminal",
                code="MAIN",
                organization_id=org.id,
                city="Lungi",
            )
            session.add(office)
            await session.flush()
            print(f"✓ Created office: Main Terminal")

            # Create default departments
            departments = [
                ("IT Department", "IT"),
                ("HR Department", "HR"),
                ("Finance Department", "FIN"),
                ("Operations Department", "OPS"),
                ("Security Department", "SEC"),
            ]
            for dept_name, dept_code in departments:
                dept = Department(
                    name=dept_name,
                    code=dept_code,
                    office_id=office.id,
                )
                session.add(dept)
            await session.flush()
            print(f"✓ Created {len(departments)} departments")

            # Create default shifts
            from datetime import time
            shifts = [
                ("Morning Shift", "MORNING", time(8, 0), time(17, 0), 15),
                ("Afternoon Shift", "AFTERNOON", time(14, 0), time(22, 0), 15),
                ("Night Shift", "NIGHT", time(22, 0), time(6, 0), 15),
            ]
            for s_name, s_code, s_start, s_end, grace in shifts:
                shift = Shift(
                    name=s_name,
                    code=s_code,
                    start_time=s_start,
                    end_time=s_end,
                    grace_period_minutes=grace,
                    is_overnight=s_code == "NIGHT",
                )
                session.add(shift)
            await session.flush()
            print(f"✓ Created {len(shifts)} shifts")
        else:
            print("⊘ Organization already exists, skipping...")

        # ── 2. Create admin role ─────────────────────────────
        existing_role = (await session.execute(
            select(Role).where(Role.name == "super_admin")
        )).scalar_one_or_none()

        if not existing_role:
            admin_role = Role(
                name="super_admin",
                display_name="Super Administrator",
                description="Full system access",
                role_type="super_admin",
                permissions={"all": True},
            )
            session.add(admin_role)
            await session.flush()
            print(f"✓ Created role: Super Administrator")

            # Create additional roles
            roles = [
                ("admin", "Administrator", "admin"),
                ("hr_manager", "HR Manager", "hr_manager"),
                ("hr_officer", "HR Officer", "hr_officer"),
                ("viewer", "Viewer", "viewer"),
            ]
            for r_name, r_display, r_type in roles:
                role = Role(
                    name=r_name,
                    display_name=r_display,
                    role_type=r_type,
                )
                session.add(role)
            await session.flush()
            print(f"✓ Created {len(roles) + 1} roles")
        else:
            admin_role = existing_role
            print("⊘ Roles already exist, skipping...")

        # ── 3. Create admin user ─────────────────────────────
        existing_user = (await session.execute(
            select(User).where(User.username == settings.DEFAULT_ADMIN_USERNAME)
        )).scalar_one_or_none()

        if not existing_user:
            admin_user = User(
                username=settings.DEFAULT_ADMIN_USERNAME,
                email=settings.DEFAULT_ADMIN_EMAIL,
                hashed_password=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                full_name="System Administrator",
                role_id=admin_role.id,
                is_active=True,
            )
            session.add(admin_user)
            await session.flush()
            print(f"✓ Created admin user: {settings.DEFAULT_ADMIN_USERNAME}")
        else:
            print("⊘ Admin user already exists, skipping...")

        await session.commit()
        print("\n✅ Seed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
