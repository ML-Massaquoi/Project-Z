"""Rodasoft User Retrieval"""
import time
from PySide6.QtCore import Signal, QThread
from core.logger import get_logger
log=get_logger("user_retrieval")

class UserRetrievalWorker(QThread):
    log_update=Signal(str,str); retrieval_complete=Signal(dict)
    sdk_call=Signal(str,str,bool,float); status_update=Signal(str)
    def __init__(self,connector):
        super().__init__(); self.connector=connector; self._cancel=False
    def cancel(self): self._cancel=True
    def run(self):
        r={"users":[],"user_count":0,"template_count":0,"template_export_supported":False,"attendance_count":0,"errors":[],"device_info":{}}
        try:
            self.status_update.emit("Device info...")
            r["device_info"]=self.connector.get_device_info()
            r["device_info"]["firmware"]=self.connector.get_firmware_version()
            self.status_update.emit("Users...")
            t0=time.time(); users=self.connector.get_users(); d=(time.time()-t0)*1000
            self.sdk_call.emit("get_users",f"{len(users)}",True,d)
            r["users"]=[{"uid":u.uid,"name":u.name,"privilege":u.privilege,"user_id":u.user_id,"card":u.card} for u in users]
            r["user_count"]=len(users); self.log_update.emit("info",f"{len(users)} users")
            if self._cancel: self.retrieval_complete.emit(r); return
            self.status_update.emit("Templates...")
            t0=time.time()
            try:
                tpl=self.connector.get_templates(); d=(time.time()-t0)*1000
                r["template_export_supported"]=True; r["template_count"]=len(tpl)
                self.sdk_call.emit("get_templates",f"{len(tpl)}",True,d)
                self.log_update.emit("info",f"Templates: SUPPORTED ({len(tpl)})")
            except Exception as e:
                d=(time.time()-t0)*1000; r["errors"].append(str(e))
                self.sdk_call.emit("get_templates",f"FAIL:{e}",False,d)
                self.log_update.emit("warning",f"Templates: UNSUPPORTED - {e}")
            if self._cancel: self.retrieval_complete.emit(r); return
            self.status_update.emit("Attendance...")
            t0=time.time()
            try:
                att=self.connector.get_attendance(); d=(time.time()-t0)*1000
                r["attendance_count"]=len(att)
                self.sdk_call.emit("get_attendance",f"{len(att)}",True,d)
                self.log_update.emit("info",f"Attendance: {len(att)} records")
            except Exception as e:
                d=(time.time()-t0)*1000; r["errors"].append(f"att:{e}")
                self.sdk_call.emit("get_attendance",f"FAIL:{e}",False,d)
                self.log_update.emit("warning",f"Attendance: FAILED - {e}")
        except Exception as e: r["errors"].append(str(e)); self.log_update.emit("error",str(e))
        self.retrieval_complete.emit(r)
