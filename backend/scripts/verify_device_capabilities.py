"""
Project Z - Device Capability Verification Script

Run this BEFORE implementing biometric synchronization.
Tests actual device capabilities against the RONASOFT ZMM220_TFT hardware.

Usage:
    python scripts/verify_device_capabilities.py --ip 172.16.40.12
    python scripts/verify_device_capabilities.py --ip 172.16.40.12 --ip 172.16.40.13
    python scripts/verify_device_capabilities.py --all  (scans 172.16.40.0/24 for devices)

Requirements:
    pip install pyzk
"""

import argparse
import hashlib
import sys
import time
from datetime import datetime


def test_device(ip: str, port: int = 4370, timeout: int = 10) -> dict:
    """
    Comprehensive device capability test.
    Returns a dict of test results.
    """
    results = {
        "ip": ip,
        "port": port,
        "timestamp": datetime.now().isoformat(),
        "tests": {},
    }

    print(f"\n{'='*60}")
    print(f"TESTING DEVICE: {ip}:{port}")
    print(f"{'='*60}")

    # ── Test 1: TCP Connection ────────────────────────────────
    print(f"\n[1] Testing TCP connection to {ip}:{port}...")
    try:
        from zk import ZK
        zk = ZK(ip, port=port, timeout=timeout, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()
        results["tests"]["tcp_connection"] = {"status": "PASS", "message": "Connected"}
        print(f"    PASS: Connected to device")
    except Exception as e:
        results["tests"]["tcp_connection"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: {e}")
        print(f"\n    Cannot proceed without TCP connection.")
        print(f"    Check: Is port {port} open? Is the device online?")
        return results

    # ── Test 2: Device Info ───────────────────────────────────
    print(f"\n[2] Reading device information...")
    try:
        info = {}
        info["serial_number"] = conn.get_serialnumber()
        info["firmware_version"] = conn.get_firmware_version()
        info["platform"] = conn.get_platform()
        info["mac"] = conn.get_mac()
        info["device_name"] = conn.get_device_name()
        info["face_version"] = conn.get_face_version()
        info["fp_version"] = conn.get_fp_version()
        info["pin_width"] = conn.get_pin_width()

        # Network params
        try:
            net = conn.get_network_params()
            info["ip_address"] = net.get("ip", "")
            info["subnet_mask"] = net.get("mask", "")
            info["gateway"] = net.get("gateway", "")
        except Exception as e:
            info["network_error"] = str(e)

        # Memory usage
        try:
            conn.read_sizes()
            info["users_count"] = conn.users
            info["users_capacity"] = conn.users_cap
            info["fingers_count"] = conn.fingers
            info["fingers_capacity"] = conn.fingers_cap
            info["records_count"] = conn.records
            info["records_capacity"] = conn.records_cap
            info["faces_count"] = getattr(conn, "faces", "N/A")
            info["faces_capacity"] = getattr(conn, "faces_cap", "N/A")
        except Exception as e:
            info["memory_error"] = str(e)

        results["tests"]["device_info"] = {"status": "PASS", "data": info}
        print(f"    PASS: Device info retrieved")
        print(f"    Serial Number:  {info.get('serial_number', 'N/A')}")
        print(f"    Firmware:       {info.get('firmware_version', 'N/A')}")
        print(f"    Platform:       {info.get('platform', 'N/A')}")
        print(f"    MAC:            {info.get('mac', 'N/A')}")
        print(f"    Device Name:    {info.get('device_name', 'N/A')}")
        print(f"    FP Version:     {info.get('fp_version', 'N/A')}")
        print(f"    Face Version:   {info.get('face_version', 'N/A')}")
        print(f"    Users:          {info.get('users_count', '?')}/{info.get('users_capacity', '?')}")
        print(f"    Fingerprints:   {info.get('fingers_count', '?')}/{info.get('fingers_capacity', '?')}")
        print(f"    Attendance:     {info.get('records_count', '?')}/{info.get('records_capacity', '?')}")
    except Exception as e:
        results["tests"]["device_info"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: {e}")

    # ── Test 3: Get Users ─────────────────────────────────────
    print(f"\n[3] Testing user export (get_users)...")
    try:
        conn.disable_device()
        users = conn.get_users()
        conn.enable_device()

        results["tests"]["get_users"] = {
            "status": "PASS",
            "count": len(users),
            "users": [
                {
                    "uid": u.uid,
                    "user_id": u.user_id,
                    "name": u.name,
                    "privilege": u.privilege,
                    "card": u.card,
                }
                for u in users[:10]  # First 10 only
            ],
        }
        print(f"    PASS: Retrieved {len(users)} users")
        for u in users[:5]:
            print(f"      - uid={u.uid} user_id={u.user_id} name='{u.name}' privilege={u.privilege}")
        if len(users) > 5:
            print(f"      ... and {len(users) - 5} more")
    except Exception as e:
        results["tests"]["get_users"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: {e}")

    # ── Test 4: Get Templates ─────────────────────────────────
    print(f"\n[4] Testing fingerprint template export (get_templates)...")
    try:
        conn.disable_device()
        templates = conn.get_templates()
        conn.enable_device()

        # Analyze templates
        template_by_user = {}
        for t in templates:
            uid = t.uid
            if uid not in template_by_user:
                template_by_user[uid] = []
            template_by_user[uid].append({
                "fid": t.fid,
                "valid": t.valid,
                "size": t.size,
                "has_data": t.template is not None and len(t.template) > 0,
            })

        results["tests"]["get_templates"] = {
            "status": "PASS",
            "total_templates": len(templates),
            "unique_users": len(template_by_user),
            "by_user": {
                str(uid): fingers
                for uid, fingers in list(template_by_user.items())[:5]
            },
        }
        print(f"    PASS: Retrieved {len(templates)} templates from {len(template_by_user)} users")
        for uid, fingers in list(template_by_user.items())[:3]:
            print(f"      - User uid={uid}: {len(fingers)} fingerprint(s)")
            for f in fingers:
                print(f"        finger={f['fid']} valid={f['valid']} size={f['size']} bytes has_data={f['has_data']}")
        if len(template_by_user) > 3:
            print(f"      ... and {len(template_by_user) - 3} more users")
    except Exception as e:
        results["tests"]["get_templates"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: {e}")
        print(f"    NOTE: If this fails, the device may not support template export via SDK.")

    # ── Test 5: Get Specific User Template ────────────────────
    print(f"\n[5] Testing specific template retrieval (get_user_template)...")
    if results["tests"].get("get_users", {}).get("status") == "PASS":
        users_data = results["tests"]["get_users"].get("users", [])
        if users_data:
            test_uid = users_data[0]["uid"]
            try:
                conn.disable_device()
                template = conn.get_user_template(uid=test_uid, temp_id=0)
                conn.enable_device()

                if template:
                    results["tests"]["get_user_template"] = {
                        "status": "PASS",
                        "uid": template.uid,
                        "fid": template.fid,
                        "valid": template.valid,
                        "size": template.size,
                        "has_data": template.template is not None and len(template.template) > 0,
                    }
                    print(f"    PASS: Retrieved template for uid={test_uid}, finger={template.fid}, size={template.size}")
                else:
                    results["tests"]["get_user_template"] = {"status": "PASS", "message": "No template found (user may have no fingerprints enrolled)"}
                    print(f"    PASS: No template found for uid={test_uid} (user may have no fingerprints)")
            except Exception as e:
                results["tests"]["get_user_template"] = {"status": "FAIL", "message": str(e)}
                print(f"    FAIL: {e}")
        else:
            results["tests"]["get_user_template"] = {"status": "SKIP", "message": "No users to test"}
            print(f"    SKIP: No users available")
    else:
        results["tests"]["get_user_template"] = {"status": "SKIP", "message": "get_users failed"}
        print(f"    SKIP: get_users failed")

    # ── Test 6: Test User Creation (DRY RUN) ──────────────────
    print(f"\n[6] Testing user creation capability (set_user) — DRY RUN...")
    print(f"    SKIPPED: This test would create a test user on the device.")
    print(f"    To test manually, run with --test-write flag.")
    results["tests"]["set_user"] = {"status": "SKIP", "message": "Dry run — use --test-write to enable"}

    # ── Test 7: Test Template Write (DRY RUN) ─────────────────
    print(f"\n[7] Testing template write capability (save_user_template) — DRY RUN...")
    print(f"    SKIPPED: This test would write a test template to the device.")
    print(f"    To test manually, run with --test-write flag.")
    results["tests"]["save_user_template"] = {"status": "SKIP", "message": "Dry run — use --test-write to enable"}

    # ── Test 8: Get Attendance ─────────────────────────────────
    print(f"\n[8] Testing attendance export (get_attendance)...")
    try:
        conn.disable_device()
        attendances = conn.get_attendance()
        conn.enable_device()

        results["tests"]["get_attendance"] = {
            "status": "PASS",
            "count": len(attendances),
            "sample": [
                {
                    "user_id": a.user_id,
                    "timestamp": a.timestamp.isoformat() if a.timestamp else None,
                    "punch": a.punch,
                }
                for a in attendances[:5]
            ],
        }
        print(f"    PASS: Retrieved {len(attendances)} attendance records")
        if attendances:
            print(f"    Sample: user_id={attendances[0].user_id} time={attendances[0].timestamp} punch={attendances[0].punch}")
    except Exception as e:
        results["tests"]["get_attendance"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: {e}")

    # Disconnect
    try:
        conn.disconnect()
    except Exception:
        pass

    # ── Summary ───────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"CAPABILITY SUMMARY for {ip}")
    print(f"{'='*60}")

    capability_map = {
        "tcp_connection": "TCP SDK Connection",
        "device_info": "Device Info Retrieval",
        "get_users": "User Export",
        "get_templates": "Fingerprint Template Export",
        "get_user_template": "Specific Template Retrieval",
        "set_user": "User Creation (Write)",
        "save_user_template": "Template Write",
        "get_attendance": "Attendance Export",
    }

    can_sync = True
    for test_key, label in capability_map.items():
        test_result = results["tests"].get(test_key, {})
        status = test_result.get("status", "UNKNOWN")
        icon = "YES" if status == "PASS" else ("NO" if status == "FAIL" else "??")
        print(f"  {icon} {label}")
        if test_key in ("get_templates", "set_user", "save_user_template") and status == "FAIL":
            can_sync = False

    print(f"\n  Device can be used for centralized sync: {'YES' if can_sync else 'NO — template capabilities missing'}")

    return results


def test_write_capabilities(ip: str, port: int = 4370, timeout: int = 10) -> dict:
    """
    Test WRITE capabilities (user creation, template write).
    Only run with --test-write flag as it modifies the device.
    """
    results = {"ip": ip, "write_tests": {}}

    print(f"\n{'='*60}")
    print(f"WRITE CAPABILITY TEST: {ip}:{port}")
    print(f"{'='*60}")
    print(f"WARNING: This will create test data on the device!")

    try:
        from zk import ZK
        from zk.user import User as ZKUser
        from zk.finger import Finger
        zk = ZK(ip, port=port, timeout=timeout, password=0, force_udp=False, ommit_ping=True)
        conn = zk.connect()

        # Test: Create a test user
        print(f"\n[WRITE-1] Creating test user 'TEST_SYNC_001'...")
        try:
            conn.disable_device()
            conn.set_user(uid=None, name="TEST_SYNC_001", user_id="99999", privilege=0)
            conn.enable_device()
            results["write_tests"]["set_user"] = {"status": "PASS"}
            print(f"    PASS: Test user created")
        except Exception as e:
            results["write_tests"]["set_user"] = {"status": "FAIL", "message": str(e)}
            print(f"    FAIL: {e}")

        # Test: Get the user we just created
        print(f"\n[WRITE-2] Verifying test user exists...")
        try:
            conn.disable_device()
            users = conn.get_users()
            conn.enable_device()
            test_user = [u for u in users if u.user_id == "99999"]
            if test_user:
                results["write_tests"]["verify_user"] = {"status": "PASS"}
                print(f"    PASS: Test user found (uid={test_user[0].uid})")
            else:
                results["write_tests"]["verify_user"] = {"status": "FAIL", "message": "User not found after creation"}
                print(f"    FAIL: User not found")
        except Exception as e:
            results["write_tests"]["verify_user"] = {"status": "FAIL", "message": str(e)}
            print(f"    FAIL: {e}")

        # Test: Delete the test user
        print(f"\n[WRITE-3] Cleaning up test user...")
        try:
            conn.disable_device()
            conn.delete_user(user_id="99999")
            conn.enable_device()
            results["write_tests"]["delete_user"] = {"status": "PASS"}
            print(f"    PASS: Test user deleted")
        except Exception as e:
            results["write_tests"]["delete_user"] = {"status": "FAIL", "message": str(e)}
            print(f"    FAIL: {e}")

        conn.disconnect()

    except Exception as e:
        results["write_tests"]["connection"] = {"status": "FAIL", "message": str(e)}
        print(f"    FAIL: Could not connect: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Verify device capabilities for Project Z sync")
    parser.add_argument("--ip", action="append", help="Device IP to test")
    parser.add_argument("--port", type=int, default=4370, help="SDK port (default: 4370)")
    parser.add_argument("--timeout", type=int, default=10, help="Connection timeout (default: 10s)")
    parser.add_argument("--test-write", action="store_true", help="Enable write tests (modifies device)")
    parser.add_argument("--all", action="store_true", help="Scan 172.16.40.0/24 for devices")
    parser.add_argument("--output", help="Save results to JSON file")
    args = parser.parse_args()

    ips = args.ip or []

    if args.all:
        print("Scanning 172.16.40.0/24 for devices on port 4370...")
        import socket
        for i in range(1, 255):
            ip = f"172.16.40.{i}"
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.5)
                result = sock.connect_ex((ip, args.port))
                sock.close()
                if result == 0:
                    print(f"  Found device at {ip}:{args.port}")
                    ips.append(ip)
            except Exception:
                pass
        if not ips:
            print("  No devices found on port 4370")
            print("  Try: --ip 172.16.40.12 --ip 172.16.40.13")

    if not ips:
        print("No IPs specified. Use --ip <address> or --all")
        print("Example: python scripts/verify_device_capabilities.py --ip 172.16.40.12")
        sys.exit(1)

    all_results = []
    for ip in ips:
        result = test_device(ip, port=args.port, timeout=args.timeout)
        all_results.append(result)

        if args.test_write:
            write_result = test_write_capabilities(ip, port=args.port, timeout=args.timeout)
            result["write_tests"] = write_result.get("write_tests", {})

    if args.output:
        import json
        with open(args.output, "w") as f:
            json.dump(all_results, f, indent=2, default=str)
        print(f"\nResults saved to {args.output}")

    # Final verdict
    print(f"\n{'='*60}")
    print(f"FINAL VERDICT")
    print(f"{'='*60}")

    for r in all_results:
        ip = r["ip"]
        tests = r.get("tests", {})
        template_export = tests.get("get_templates", {}).get("status") == "PASS"
        user_export = tests.get("get_users", {}).get("status") == "PASS"
        tcp_ok = tests.get("tcp_connection", {}).get("status") == "PASS"

        if tcp_ok and template_export and user_export:
            print(f"  {ip}: READY for centralized biometric sync")
        elif tcp_ok and user_export:
            print(f"  {ip}: PARTIAL — users work but template export unverified")
        elif tcp_ok:
            print(f"  {ip}: LIMITED — TCP connects but SDK calls fail")
        else:
            print(f"  {ip}: NOT READY — cannot connect via TCP SDK")


if __name__ == "__main__":
    main()
