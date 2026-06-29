"""Rodasoft Sync Tester"""
import time
from PySide6.QtCore import Signal, QThread
from core.logger import get_logger
log=get_logger("sync_tester")

class SyncResult:
    def __init__(self):
        self.source_device=""; self.dest_device=""; self.user_uid=0
        self.user_name=""; self.user_id=""; self.steps=[]; self.overall_success=False; self.conclusion=""

class SyncWorker(QThread):
    log_update=Signal(str,str); step_complete=Signal(str,str,bool,float)
    sync_complete=Signal(object); status_update=Signal(str)
    def __init__(self,src,dst,uid):
        super().__init__(); self.source=src; self.dest=dst; self.user_uid=uid
    def run(self):
        r=SyncResult(); r.source_device=self.source.config.name
        r.dest_device=self.dest.config.name; r.user_uid=self.user_uid
        try:
            if not self.source.is_connected: raise Exception("Source not connected")
            if not self.dest.is_connected: raise Exception("Destination not connected")
            self.status_update.emit(f"Reading user UID={self.user_uid}...")
            t0=time.time(); users=self.source.get_users()
            u=next((x for x in users if x.uid==self.user_uid),None)
            if not u: u=next((x for x in users if x.user_id==str(self.user_uid)),None)
            if not u: raise Exception(f"User {self.user_uid} not found")
            d=(time.time()-t0)*1000; r.user_name=u.name; r.user_id=u.user_id
            r.steps.append({"step":"READ_USER","success":True,"duration_ms":d})
            self.step_complete.emit("READ_USER",f"Found:{u.name}",True,d)
            self.status_update.emit("Reading templates...")
            t0=time.time(); tpl=[]
            try:
                at=self.source.get_templates(); tpl=[t for t in at if t.uid==u.uid]
                d=(time.time()-t0)*1000; r.steps.append({"step":"READ_TEMPLATES","success":True,"duration_ms":d})
                self.step_complete.emit("READ_TEMPLATES",f"{len(tpl)} tpl",True,d)
            except Exception as e:
                d=(time.time()-t0)*1000; r.steps.append({"step":"READ_TEMPLATES","success":False,"duration_ms":d})
                self.step_complete.emit("READ_TEMPLATES",f"FAIL:{e}",False,d)
            self.status_update.emit("Creating user on destination...")
            t0=time.time()
            try:
                self.dest.set_user(uid=u.uid,name=u.name,privilege=u.privilege,password=getattr(u,'password',''),group_id=getattr(u,'group_id',''),user_id=u.user_id)
                d=(time.time()-t0)*1000; r.steps.append({"step":"SET_USER","success":True,"duration_ms":d,"detail":"User created"})
                self.step_complete.emit("SET_USER","User created",True,d)
            except Exception as e:
                d=(time.time()-t0)*1000; r.steps.append({"step":"SET_USER","success":False,"duration_ms":d})
                self.step_complete.emit("SET_USER",f"FAIL:{e}",False,d)
            self.status_update.emit("Uploading templates...")
            if tpl:
                t0=time.time()
                try:
                    fd=[{"uid":t.uid,"fid":t.fid,"valid":t.valid,"template":t.template} for t in tpl]
                    self.dest.save_user_template(uid=u.uid,name=u.name,fingers_data=fd)
                    d=(time.time()-t0)*1000; r.steps.append({"step":"UPLOAD_TEMPLATES","success":True,"duration_ms":d})
                    self.step_complete.emit("UPLOAD_TEMPLATES",f"{len(tpl)} uploaded",True,d)
                except Exception as e:
                    d=(time.time()-t0)*1000; r.steps.append({"step":"UPLOAD_TEMPLATES","success":False,"duration_ms":d})
                    self.step_complete.emit("UPLOAD_TEMPLATES",f"FAIL:{e}",False,d)
            else: r.steps.append({"step":"UPLOAD_TEMPLATES","success":None,"duration_ms":0})
            self.status_update.emit("Verifying...")
            t0=time.time()
            try:
                du=self.dest.get_users(); sc=[x for x in du if x.uid==u.uid or x.user_id==u.user_id]
                if sc:
                    d=(time.time()-t0)*1000; r.steps.append({"step":"VERIFY","success":True,"duration_ms":d})
                    self.step_complete.emit("VERIFY",f"Found:{sc[0].name}",True,d); r.overall_success=True
                else:
                    d=(time.time()-t0)*1000; r.steps.append({"step":"VERIFY","success":False,"duration_ms":d})
                    self.step_complete.emit("VERIFY","Not found",False,d)
            except Exception as e:
                d=(time.time()-t0)*1000; r.steps.append({"step":"VERIFY","success":False,"duration_ms":d})
                self.step_complete.emit("VERIFY",f"FAIL:{e}",False,d)
        except Exception as e:
            log.log_operation("sync",exception=e,success=False); r.overall_success=False
        finally:
            fail=[s for s in r.steps if s.get("success")==False]
            if r.overall_success: r.conclusion="SYNC_SUCCESSFUL"
            elif any("READ_TEMPLATES" in s["step"] for s in fail): r.conclusion="SYNC_PARTIAL - Template export not supported"
            else: r.conclusion=f"SYNC_FAILED - {len(fail)} steps failed"
            self.sync_complete.emit(r)
