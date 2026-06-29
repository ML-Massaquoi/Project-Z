"""
VERIFIED ENROLLMENT WORKFLOW
Based on actual testing with ZMM220_TFT (RONASOFT MX-710).

Findings:
- CMD_STARTENROLL IS supported
- enroll_user() returns False when session ends (not reliable for success detection)
- Templates ARE captured on the device even when return is False
- Must verify enrollment by checking templates afterward
"""
import sys, os, time, threading
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zk import ZK

IP = "172.16.40.12"
PORT = 4370

def enroll_user_on_device(ip, port, uid, user_id, name, timeout=45):
    """
    Complete enrollment workflow for ZMM220_TFT devices.
    
    Returns: dict with success, templates, duration_ms, error
    """
    result = {"success": False, "templates": [], "duration_ms": 0, "error": None}
    
    zk = ZK(ip, port=port, timeout=10, password=0, verbose=False)
    
    try:
        t0 = time.time()
        
        # Connect
        if not zk.connect():
            result["error"] = "Failed to connect"
            return result
        
        # Register user
        zk.set_user(uid=uid, name=name[:8], privilege=0, user_id=user_id)
        
        # Register events
        try: zk.reg_event(1 | 2 | 4 | 8 | 16 | 32 | 128)
        except: pass
        
        # Send enrollment command (blocks until finger scanned or timeout)
        # NOTE: Returns False when session ends - this is NORMAL
        def do_enroll():
            try:
                zk.enroll_user(uid=uid, user_id=user_id, temp_id=0)
            except:
                pass
        
        t = threading.Thread(target=do_enroll, daemon=True)
        t.start()
        t.join(timeout=timeout)
        
        # Wait briefly for device to finalize
        time.sleep(1)
        
        # Verify by checking templates (THIS is the real success check)
        try:
            tpl = zk.get_templates()
            user_tpl = [t for t in tpl if t.uid == uid]
            result["templates"] = [
                {"fid": t.fid, "valid": t.valid, "size": t.size, "has_template": bool(t.template)}
                for t in user_tpl
            ]
            result["success"] = len(user_tpl) > 0
        except Exception as e:
            result["error"] = f"Template check failed: {e}"
        
        result["duration_ms"] = (time.time() - t0) * 1000
        zk.disconnect()
        
    except Exception as e:
        result["error"] = str(e)
        try: zk.disconnect()
        except: pass
    
    return result


def main():
    print("=== ZMM220_TFT Enrollment Test ===")
    print(f"Device: {IP}:{PORT}")
    print()
    
    # Find free UID
    zk = ZK(IP, port=PORT, timeout=10, password=0, verbose=False)
    if not zk.connect():
        print("Cannot connect"); exit(1)
    users = zk.get_users()
    free_uid = max(u.uid for u in users) + 1
    user_id = f"ENR_{free_uid}"
    zk.disconnect()
    
    print(f"Using UID: {free_uid}, user_id: {user_id}")
    print()
    print(">>> DEVICE WILL ENTER ENROLLMENT MODE <<<")
    print(">>> SCAN YOUR FINGER WHEN READY <<<")
    print()
    
    r = enroll_user_on_device(IP, PORT, free_uid, user_id, "TEST_ENR", timeout=45)
    
    print(f"Result: {'SUCCESS' if r['success'] else 'FAILED'}")
    print(f"Duration: {r['duration_ms']:.0f}ms")
    print(f"Templates captured: {len(r['templates'])}")
    for t in r["templates"]:
        print(f"  fid={t['fid']} valid={t['valid']} size={t['size']}")
    if r["error"]:
        print(f"Error: {r['error']}")
    
    print()
    if r["success"]:
        print(">>> ENROLLMENT VERIFIED - Fingerprint stored on device! <<<")
    else:
        print(">>> No templates captured - enrollment may have failed <<<")


if __name__ == "__main__":
    main()
