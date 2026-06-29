"""Test face enrollment on ZMM220_TFT device."""
import sys, os, time, threading
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zk import ZK

IP = "172.16.40.12"
PORT = 4370

log = open("face_test_output.txt", "w")
def p(s):
    print(s)
    log.write(s + "\n")
    log.flush()

p("=== Face Enrollment Test ===")

zk = ZK(IP, port=PORT, timeout=10, password=0, verbose=False)
if not zk.connect():
    p("FAILED to connect"); log.close(); exit(1)

p(f"Connected! FW: {zk.get_firmware_version()}")
p(f"Face version: {zk.get_face_version()}")
p(f"Face function on: {zk.get_face_fun_on()}")

# Register fresh user
test_uid = 2000
zk.set_user(uid=test_uid, name="FACE_TST", privilege=0, user_id="FACE_TEST")
p(f"Registered UID {test_uid}")

# Register events
try: zk.reg_event(1 | 2 | 4 | 8 | 16 | 32 | 128)
except: pass

# Try temp_id=1 (face)
p("\nSending enroll_user with temp_id=1 (face enrollment)...")
p(">>> DEVICE SHOULD SHOW FACE ENROLLMENT <<<")
p(">>> LOOK AT THE DEVICE CAMERA <<<")

result_holder = {}
def do_enroll():
    try:
        r = zk.enroll_user(uid=test_uid, user_id="FACE_TEST", temp_id=1)
        result_holder["result"] = r
        p(f"enroll_user returned: {r}")
    except Exception as e:
        result_holder["error"] = str(e)
        p(f"enroll_user error: {e}")

t = threading.Thread(target=do_enroll, daemon=True)
t.start()
t.join(timeout=45)

if t.is_alive():
    p("Still waiting after 45s - no face detected")
else:
    if "result" in result_holder:
        p(f"Result: {result_holder['result']}")
    elif "error" in result_holder:
        p(f"Error: {result_holder['error']}")

# Check templates
time.sleep(1)
p("\nChecking templates for UID 2000...")
try:
    tpl = zk.get_templates()
    user_tpl = [t for t in tpl if t.uid == test_uid]
    p(f"Templates: {len(user_tpl)}")
    for t in user_tpl:
        p(f"  fid={t.fid} size={t.size} valid={t.valid}")
except Exception as e:
    p(f"Error checking templates: {e}")

try: zk.disconnect()
except: pass

p("\n=== Done ===")
log.close()
