"""Rodasoft Enrollment Tester"""
import time
from datetime import datetime
from PySide6.QtCore import Signal, QThread
from core.logger import get_logger

log = get_logger("enrollment_tester")

class EnrollmentResult:
    def __init__(self):
        self.timeline = []; self.success = False; self.duration_ms = 0
        self.error = None; self.finger_count = 0; self.face_count = 0
    def add_event(self, event, detail=""):
        self.timeline.append((datetime.now().isoformat(), event, detail))

class EnrollmentWorker(QThread):
    log_update = Signal(str, str); event_occurred = Signal(str, str)
    enrollment_complete = Signal(object); sdk_call = Signal(str, str, bool, float)
    status_update = Signal(str)
    def __init__(self, connector, uid, user_id="", temp_id=0):
        super().__init__(); self.connector=connector; self.uid=uid
        self.user_id=user_id; self.temp_id=temp_id; self._cancel=False
    def cancel(self): self._cancel=True
    def run(self):
        r=EnrollmentResult(); st=time.time()
        try:
            self.status_update.emit("Getting users...")
            users=self.connector.get_users()
            r.add_event("GOT_USERS",f"{len(users)} users")
            self.status_update.emit("Disabling device...")
            self.connector.disable_device()
            self.status_update.emit("Registering events...")
            try: self.connector.reg_event(4); r.add_event("REG_EVENT","OK")
            except Exception as e: r.add_event("REG_EVENT_FAIL",str(e))
            self.status_update.emit(f"Enrolling UID={self.uid}...")
            r.add_event("START_ENROLL",f"UID={self.uid}")
            es=time.time()
            try:
                er=self.connector.start_enroll_finger(uid=self.uid,user_id=self.user_id,temp_id=self.temp_id)
                ed=(time.time()-es)*1000
                self.sdk_call.emit("enroll_user",str(er),bool(er),ed)
                if er:
                    r.success=True; r.add_event("ENROLLMENT_DONE",f"{ed:.0f}ms")
                    self.status_update.emit("Enrollment completed!")
                else: r.add_event("ENROLLMENT_FAILED","returned False")
            except Exception as e:
                ed=(time.time()-es)*1000; self.sdk_call.emit("enroll_user",str(e),False,ed)
                r.add_event("ENROLL_EXCEPTION",str(e)); r.error=str(e)
            try: self.connector.cancel_capture(); self.connector.reg_event(0)
            except Exception: pass
            try:
                self.connector.enable_device()
                up=self.connector.get_users()
                r.add_event("VERIFY_USERS",f"{len(up)} post-enroll")
            except Exception as e: r.add_event("VERIFY_FAIL",str(e))
        except Exception as e:
            r.add_event("WORKER_ERROR",str(e)); r.error=str(e)
        finally:
            r.duration_ms=(time.time()-st)*1000; self.enrollment_complete.emit(r)
