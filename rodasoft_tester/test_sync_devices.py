"""Test device-to-device synchronization."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zk import ZK
from zk.user import User
from zk.finger import Finger

SRC_IP = "172.16.40.12"  # Device A (source)
DST_IP = "172.16.40.13"  # Device B (destination)
PORT = 4370
SYNC_UID = 1001  # User we enrolled earlier

log = open("sync_test_output.txt", "w")
def p(s):
    print(s)
    log.write(s + "\n")
    log.flush()

p("=== Device Sync Test ===")
p(f"Source: {SRC_IP}")
p(f"Destination: {DST_IP}")
p(f"User to sync: UID {SYNC_UID}")

# ── Step 1: Read user from Device A ──
p("\n[1] Reading user from Device A...")
src = ZK(SRC_IP, port=PORT, timeout=10, password=0, verbose=False)
if not src.connect():
    p("FAILED to connect to Device A"); log.close(); exit(1)

users = src.get_users()
src_user = next((u for u in users if u.uid == SYNC_UID), None)
if not src_user:
    p(f"  UID {SYNC_UID} not found on Device A"); src.disconnect(); log.close(); exit(1)

p(f"  Found: uid={src_user.uid} name={src_user.name} user_id={src_user.user_id} privilege={src_user.privilege}")

# ── Step 2: Read templates from Device A ──
p("\n[2] Reading templates from Device A...")
all_tpl = src.get_templates()
src_tpl = [t for t in all_tpl if t.uid == SYNC_UID]
p(f"  Templates: {len(src_tpl)}")
for t in src_tpl:
    p(f"    fid={t.fid} size={t.size} valid={t.valid} has_data={'YES' if t.template else 'NO'}")
src.disconnect()

# ── Step 3: Create user on Device B ──
p("\n[3] Creating user on Device B...")
dst = ZK(DST_IP, port=PORT, timeout=10, password=0, verbose=False)
if not dst.connect():
    p("FAILED to connect to Device B"); log.close(); exit(1)

# Check if user already exists
dst_users = dst.get_users()
dst_existing = next((u for u in dst_users if u.uid == SYNC_UID), None)
if dst_existing:
    p(f"  UID {SYNC_UID} already exists on Device B: {dst_existing.name}")
else:
    try:
        dst.set_user(uid=SYNC_UID, name=src_user.name, privilege=src_user.privilege, user_id=src_user.user_id)
        p(f"  Created user: uid={SYNC_UID} name={src_user.name}")
    except Exception as e:
        p(f"  Error creating user: {e}")

# ── Step 4: Upload templates to Device B ──
p("\n[4] Uploading templates to Device B...")
if not src_tpl:
    p("  No templates to upload")
else:
    try:
        # Build finger objects
        fingers = []
        for t in src_tpl:
            if t.template:
                f = Finger(uid=SYNC_UID, fid=t.fid, valid=t.valid, template=t.template)
                fingers.append(f)
        
        p(f"  Uploading {len(fingers)} templates...")
        
        # Use save_user_template
        user = User(uid=SYNC_UID, name=src_user.name, privilege=src_user.privilege, user_id=src_user.user_id)
        dst.save_user_template(user=user, fingers=fingers)
        p("  Templates uploaded!")
    except Exception as e:
        p(f"  Error uploading templates: {e}")

# ── Step 5: Verify on Device B ──
p("\n[5] Verifying on Device B...")
time.sleep(1)
dst_users = dst.get_users()
verify_user = next((u for u in dst_users if u.uid == SYNC_UID), None)
if verify_user:
    p(f"  User found: uid={verify_user.uid} name={verify_user.name} user_id={verify_user.user_id}")
else:
    p("  User NOT found on Device B!")

dst_tpl = dst.get_templates()
verify_tpl = [t for t in dst_tpl if t.uid == SYNC_UID]
p(f"  Templates on Device B: {len(verify_tpl)}")
for t in verify_tpl:
    p(f"    fid={t.fid} size={t.size} valid={t.valid}")

dst.disconnect()

# ── Summary ──
p("\n=== RESULT ===")
if verify_user and len(verify_tpl) > 0:
    p(">>> SYNC SUCCESSFUL! <<<")
    p(f">>> User {SYNC_UID} ({src_user.name}) can now authenticate on Device B <<<")
    p(f">>> Templates transferred: {len(verify_tpl)} <<<")
else:
    p(">>> SYNC FAILED <<<")
    if not verify_user:
        p("  User not found on Device B")
    if len(verify_tpl) == 0:
        p("  No templates transferred")

p("\n=== Done ===")
log.close()
