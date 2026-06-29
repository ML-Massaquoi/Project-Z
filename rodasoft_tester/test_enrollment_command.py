"""
ENROLLMENT TEST - Run this, then IMMEDIATELY go scan your finger on the device.

The device will open its enrollment screen.
Place your finger 2-3 times as prompted by the device.
"""
import sys, os, time, threading
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zk import ZK

IP = "172.16.40.12"
PORT = 4370

print("=== ENROLLMENT TEST ===")
print()
print("STEP 1: Connecting to device...")
zk = ZK(IP, port=PORT, timeout=10, password=0, verbose=False)

if not zk.connect():
    print("FAILED to connect"); exit(1)

print(f"  Connected! FW: {zk.get_firmware_version()}")
print(f"  Device time: {zk.get_time()}")

# Find a free UID
users = zk.get_users()
used_uids = {u.uid for u in users}
free_uid = max(used_uids) + 1
print(f"  Total users: {len(users)}")
print(f"  Using fresh UID: {free_uid}")

# Register a new user (no fingerprint yet)
print()
print("STEP 2: Registering new user on device (no fingerprint yet)...")
zk.set_user(uid=free_uid, name="TEST_ENR", privilege=0, user_id=f"ENR_{free_uid}")
print(f"  Registered UID {free_uid}")

# Register events
try:
    zk.reg_event(1 | 2 | 4 | 8 | 16 | 32 | 128)
except:
    pass

# Send enrollment command
print()
print("STEP 3: Sending enrollment command...")
print()
print("  ============================================")
print("  >>> DEVICE IS NOW IN ENROLLMENT MODE <<<")
print("  >>> GO TO DEVICE 172.16.40.12 NOW! <<<")
print("  >>> SCAN YOUR FINGER 2-3 TIMES <<<")
print("  ============================================")
print()

result_holder = {}
def do_enroll():
    try:
        t0 = time.time()
        r = zk.enroll_user(uid=free_uid, user_id=f"ENR_{free_uid}", temp_id=0)
        result_holder["result"] = r
        result_holder["ms"] = (time.time() - t0) * 1000
    except Exception as e:
        result_holder["error"] = str(e)

t = threading.Thread(target=do_enroll, daemon=True)
t.start()

# Wait up to 60 seconds
print("  Waiting for you to scan (60s timeout)...")
t.join(timeout=60)

if t.is_alive():
    print()
    print("  TIMEOUT: No finger detected in 60s")
    print("  Device may still be in enrollment mode")
else:
    print()
    if "result" in result_holder:
        r = result_holder["result"]
        print(f"  Enrollment returned: {r} ({result_holder.get('ms',0):.0f}ms)")
        if r:
            print("  >>> ENROLLMENT SUCCESSFUL! <<<")
        else:
            print("  >>> Enrollment returned False <<<")
    elif "error" in result_holder:
        print(f"  Error: {result_holder['error']}")

# Verify templates
print()
print("STEP 4: Verifying enrollment...")
try:
    time.sleep(1)
    tpl = zk.get_templates()
    user_tpl = [t for t in tpl if t.uid == free_uid]
    print(f"  Templates for UID {free_uid}: {len(user_tpl)}")
    for t in user_tpl:
        print(f"    fid={t.fid} valid={t.valid} size={t.size} template={'YES' if t.template else 'NO'}")
    if user_tpl:
        print("  >>> FINGERPRINT CAPTURED AND STORED! <<<")
    else:
        print("  No templates found (scan may not have completed)")
except Exception as e:
    print(f"  Could not check templates: {e}")

# Cleanup
try: zk.disconnect()
except: pass

print()
print("=== TEST COMPLETE ===")
