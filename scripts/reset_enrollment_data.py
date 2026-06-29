"""
Project Z - Full Reset: Database + Physical Devices
"""
import asyncio
import json
import logging
import os
import sys
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql+asyncpg://projectz:519016@127.0.0.1:5433/projectz_db"

DEVICES = [
    {"ip": "172.16.40.12", "port": 4370, "name": "MX-710 IT Office"},
    {"ip": "172.16.40.13", "port": 4370, "name": "MX-710 HR Office"},
]

BACKUP_FILE = "device_users_backup_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"


def clear_device_users(device_ip: str, port: int, device_name: str):
    from zk import ZK
    conn = None
    try:
        zk = ZK(device_ip, port=port, timeout=30, password=0, force_udp=False)
        print("  Connecting to " + device_name + " (" + device_ip + ":" + str(port) + ")...")
        conn = zk.connect()
        if not conn:
            print("  FAILED to connect to " + device_name)
            return [], 0

        users = conn.get_users()
        print("  Found " + str(len(users)) + " users on " + device_name)

        backup = []
        for u in users:
            backup.append({
                "uid": u.uid,
                "user_id": u.user_id,
                "name": u.name,
                "privilege": u.privilege,
                "device_ip": device_ip,
                "device_name": device_name,
            })

        if not users:
            print("  No users to delete on " + device_name)
            return backup, 0

        deleted = 0
        for u in users:
            try:
                if u.privilege >= 14:
                    print("  Skipping admin uid=" + str(u.uid) + " name=" + u.name)
                    continue
                conn.delete_user(uid=u.uid)
                deleted += 1
                if deleted % 5 == 0 or deleted == len(users):
                    print("  Deleted " + str(deleted) + "/" + str(len(users)) + " users...")
            except Exception as e:
                print("  Failed to delete uid=" + str(u.uid) + " (" + u.name + "): " + str(e))

        print("  OK " + device_name + ": " + str(deleted) + " users deleted")
        return backup, deleted

    except Exception as e:
        print("  Device error " + device_name + ": " + str(e))
        return [], 0
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


async def cleanup_database(engine) -> dict:
    deleted = {}
    async with engine.connect() as conn:
        for tbl in [
            "audit_logs", "device_sync_logs", "device_activity_logs",
            "expected_attendance", "employee_enrollment_history",
        ]:
            try:
                r = await conn.execute(text(f"DELETE FROM {tbl}"))
                deleted[tbl] = r.rowcount
                print("  " + tbl + ": " + str(r.rowcount) + " rows")
            except Exception as e:
                print("  ~ " + tbl + ": " + str(e))
                deleted[tbl] = -1

        for tbl in ["face_templates", "fingerprint_templates"]:
            try:
                r = await conn.execute(text(f"DELETE FROM {tbl}"))
                deleted[tbl] = r.rowcount
                print("  " + tbl + ": " + str(r.rowcount) + " rows")
            except Exception as e:
                print("  ~ " + tbl + ": " + str(e))

        r = await conn.execute(text("DELETE FROM employees"))
        deleted["employees"] = r.rowcount
        print("  employees: " + str(r.rowcount) + " rows (cascade to children)")

        await conn.execute(text(
            "UPDATE device_sync_status SET is_provisioned = FALSE, provisioned_at = NULL"
        ))
        print("  device_sync_status: reset is_provisioned = false")
        deleted["device_sync_status"] = 0

        for tbl in ["device_status_history", "device_health_logs"]:
            try:
                r = await conn.execute(text(f"DELETE FROM {tbl}"))
                if r.rowcount:
                    deleted[tbl] = r.rowcount
            except Exception:
                pass

        await conn.commit()
    return deleted


async def main():
    print("=" * 60)
    print("  Project Z - Full Reset")
    print("=" * 60)

    # Phase 1: Clear physical devices
    print("\n--- Phase 1: Clearing biometric devices ---")
    all_backups = []
    total_device_users = 0
    for dev in DEVICES:
        backup, count = await asyncio.to_thread(
            clear_device_users, dev["ip"], dev["port"], dev["name"]
        )
        all_backups.extend(backup)
        total_device_users += count

    backup_path = os.path.join(os.path.dirname(__file__), BACKUP_FILE)
    with open(backup_path, "w") as f:
        json.dump(all_backups, f, indent=2, default=str)
    print("\nBackup saved to " + BACKUP_FILE + " (" + str(len(all_backups)) + " users)")

    # Phase 2: Clear database
    print("\n--- Phase 2: Cleaning database ---")
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.connect() as conn:
        print("  Current row counts:")
        total = 0
        for tbl in [
            "employees", "fingerprint_templates", "enrollment_sessions",
            "device_users", "employee_device_mappings",
            "attendance_logs", "device_sync_logs", "audit_logs",
        ]:
            row = await conn.execute(text(f"SELECT count(*) FROM {tbl}"))
            c = row.scalar()
            print("    " + tbl + ": " + str(c))
            total += c

    confirm = input("Delete " + str(total) + " DB rows + " + str(total_device_users) + " device users? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Aborted.")
        await engine.dispose()
        return

    deleted = await cleanup_database(engine)
    await engine.dispose()

    print("\n" + "=" * 60)
    print("  Reset Complete!")
    print("=" * 60)
    print("\n  Devices: " + str(total_device_users) + " users deleted")
    print("  Backup: " + BACKUP_FILE)
    print("\n  Next sync will re-provision all devices.")
    print("  You can now enroll employees with fresh fingerprints.")


if __name__ == "__main__":
    asyncio.run(main())
