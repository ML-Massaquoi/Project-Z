"""
Project Z - Database Reset Only
Deletes all employees (cascades to templates, sessions, device_users, etc.)
and resets device_sync_status for fresh provisioning.
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "postgresql+asyncpg://projectz:519016@127.0.0.1:5433/projectz_db"


async def main():
    print("=" * 60)
    print("  Project Z - Database Reset")
    print("=" * 60)

    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.connect() as conn:
        print("\n  Current row counts:")
        for tbl in [
            "employees", "fingerprint_templates", "face_templates",
            "enrollment_sessions", "device_users", "employee_device_mappings",
            "attendance_logs", "attendance_sessions", "device_sync_logs",
            "audit_logs", "expected_attendance", "employee_enrollment_history",
        ]:
            row = await conn.execute(text(f"SELECT count(*) FROM {tbl}"))
            c = row.scalar()
            print("    " + tbl + ": " + str(c))

        confirm = input("\nDelete ALL rows from all tables above? (yes/no): ").strip().lower()
        if confirm != "yes":
            print("  Aborted.")
            await engine.dispose()
            return

        print("\n  Deleting...")

        # Tables with non-cascading FKs - clean first
        for tbl in [
            "audit_logs", "device_sync_logs", "device_activity_logs",
            "expected_attendance", "employee_enrollment_history",
            "device_status_history", "device_health_logs",
        ]:
            try:
                r = await conn.execute(text(f"DELETE FROM {tbl}"))
                print("    " + tbl + ": " + str(r.rowcount) + " rows")
            except Exception as e:
                print("    ~ " + tbl + ": " + str(e))

        # Fingerprint/face templates
        for tbl in ["face_templates", "fingerprint_templates"]:
            try:
                r = await conn.execute(text(f"DELETE FROM {tbl}"))
                print("    " + tbl + ": " + str(r.rowcount) + " rows")
            except Exception as e:
                print("    ~ " + tbl + ": " + str(e))

        # Employees - CASCADE handles enrollment_sessions, device_users,
        # employee_device_mappings, attendance_logs, shift_assignments, etc.
        r = await conn.execute(text("DELETE FROM employees"))
        print("    employees: " + str(r.rowcount) + " rows (cascaded to children)")

        # Reset device sync status
        await conn.execute(text(
            "UPDATE device_sync_status SET is_provisioned = FALSE, provisioned_at = NULL"
        ))
        print("    device_sync_status: reset to unprovisioned")

        await conn.commit()

    await engine.dispose()
    print("\n  Done! Database cleared.")
    print("  Devices still have their users - will be re-imported on next sync.")
    print("\n  Next step: clear devices via SDK if you want a true fresh start.")
    print("  Or use the wizard to enroll new employees (will register on device).")


if __name__ == "__main__":
    asyncio.run(main())
