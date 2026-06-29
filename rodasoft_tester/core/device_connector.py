"""Rodasoft Device Connector"""
import time
from datetime import datetime
from zk import ZK
from core.logger import get_logger

class DeviceConfig:
    def __init__(self, name="", ip="", port=4370, password=0, timeout=60):
        self.name = name or f"Device_{ip}"; self.ip = ip; self.port = port
        self.password = password; self.timeout = timeout
    def dict(self):
        return {"name":self.name,"ip":self.ip,"port":self.port,"password":self.password,"timeout":self.timeout}
    @staticmethod
    def from_dict(d):
        return DeviceConfig(d.get("name",""),d.get("ip",""),d.get("port",4370),d.get("password",0),d.get("timeout",60))

class DeviceConnector:
    def __init__(self, config):
        self.config=config; self.log=get_logger(f"dev_{config.name}")
        self._zk=None; self._connected=False; self._fw=None; self._dt=None; self._lp=None
    @property
    def is_connected(self): return self._connected

    def connect(self):
        t0=time.time(); self.log.info(f"Conn {self.config.ip}:{self.config.port}")
        try:
            self._zk=ZK(self.config.ip,port=self.config.port,timeout=self.config.timeout,password=self.config.password,verbose=True)
            if self._zk.connect():
                self._connected=True
                try: self._fw=self._zk.get_firmware_version()
                except Exception: self._fw="?"
                try: d=self._zk.get_time(); self._dt=d.isoformat() if d else None
                except Exception: self._dt="?"
                self._lp=datetime.now().isoformat()
                self.log.log_operation("connect",response=f"OK FW:{self._fw}",duration_ms=(time.time()-t0)*1000,success=True)
                return True
            self.log.log_operation("connect",response="None",duration_ms=(time.time()-t0)*1000,success=False)
            return False
        except Exception as e:
            self.log.log_operation("connect",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise


    def disconnect(self):
        t0=time.time()
        try:
            if self._zk: self._zk.disconnect()
            self._connected=False
            self.log.log_operation("disconnect",duration_ms=(time.time()-t0)*1000,success=True)
        except Exception as e: self.log.log_operation("disconnect",exception=e,duration_ms=(time.time()-t0)*1000)

    def ping(self):
        t0=time.time()
        try:
            d=self._zk.get_time(); self._dt=d.isoformat() if d else None
            self._lp=datetime.now().isoformat()
            self.log.log_operation("ping",response=f"OK:{self._dt}",duration_ms=(time.time()-t0)*1000,success=True)
            return True
        except Exception as e:
            self.log.log_operation("ping",exception=e,duration_ms=(time.time()-t0)*1000,success=False); return False

    def enable_device(self):
        try: self._zk.enable_device(); self.log.log_operation("enable",success=True); return True
        except Exception as e: self.log.log_operation("enable",exception=e,success=False); raise

    def disable_device(self):
        try: self._zk.disable_device(); self.log.log_operation("disable",success=True); return True
        except Exception as e: self.log.log_operation("disable",exception=e,success=False); raise

    def get_firmware_version(self): return self._fw
    def get_device_time(self): return self._dt

    def get_sdk_version(self):
        try: return "pyzk "+".".join(str(v) for v in __import__("zk").VERSION)
        except Exception: return "pyzk"

    def get_device_info(self):
        info={}; t0=time.time()
        try:
            info["firmware"]=self._zk.get_firmware_version()
            for a in ["serial_number","device_name","platform","mac","face_version"]:
                try: info[a]=str(getattr(self._zk,f"get_{a}")())
                except Exception: info[a]="N/A"
            self.log.log_operation("get_device_info",response=info,duration_ms=(time.time()-t0)*1000,success=True)
        except Exception as e: self.log.log_operation("get_device_info",exception=e,duration_ms=(time.time()-t0)*1000,success=False)
        return info

    def get_users(self):
        t0=time.time()
        try:
            was=self._connected
            if was: self.disable_device()
            try:
                users=self._zk.get_users()
            finally:
                if was: self.enable_device()
            u2=[{"uid":u.uid,"name":u.name,"privilege":u.privilege,"user_id":u.user_id,"card":u.card} for u in users]
            self.log.log_operation("get_users",response=f"{len(users)}users",duration_ms=(time.time()-t0)*1000,success=True,raw_output=u2)
            return users
        except Exception as e: self.log.log_operation("get_users",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise

    def get_templates(self):
        t0=time.time()
        try:
            was=self._connected
            if was: self.disable_device()
            try:
                tpl=self._zk.get_templates()
            finally:
                if was: self.enable_device()
            t2=[{"uid":t.uid,"fid":t.fid,"valid":t.valid,"size":t.size} for t in tpl]
            self.log.log_operation("get_templates",response=f"{len(tpl)}tpl",duration_ms=(time.time()-t0)*1000,success=True,raw_output=t2)
            return tpl
        except Exception as e: self.log.log_operation("get_templates",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise

    def start_enroll_finger(self,uid,user_id="",temp_id=0):
        t0=time.time()
        try:
            r=self._zk.enroll_user(uid=uid,user_id=user_id,temp_id=temp_id)
            self.log.log_operation("enroll_finger",response=r,duration_ms=(time.time()-t0)*1000,success=bool(r))
            return r
        except Exception as e: self.log.log_operation("enroll_finger",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise

    def cancel_enroll(self):
        try: self._zk.cancel_capture(); self.log.log_operation("cancel",success=True); return True
        except Exception as e: self.log.log_operation("cancel",exception=e,success=False); raise

    def reg_event(self,flags):
        try: self._zk.reg_event(flags); self.log.log_operation("reg_event",request=f"f={flags}",success=True); return True
        except Exception as e: self.log.log_operation("reg_event",exception=e,success=False); raise

    def live_capture(self,timeout=30):
        try:
            for event in self._zk.live_capture(new_timeout=timeout): yield event
        except Exception as e: self.log.log_operation("live_capture",exception=e,success=False)

    def set_user(self,uid=None,name="",privilege=0,password="",group_id="",user_id=""):
        t0=time.time()
        try:
            was=self._connected
            if was: self.disable_device()
            try:
                self._zk.set_user(uid=uid,name=name,privilege=privilege,password=password,group_id=group_id,user_id=user_id)
            finally:
                if was: self.enable_device()
            self.log.log_operation("set_user",request=f"uid={uid}",success=True,duration_ms=(time.time()-t0)*1000)
            return True
        except Exception as e: self.log.log_operation("set_user",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise

    def save_user_template(self,uid,name,fingers_data):
        t0=time.time()
        try:
            was=self._connected
            if was: self.disable_device()
            try:
                from zk.user import User; from zk.finger import Finger
                user=User(uid=uid,name=name,privilege=0,user_id=str(uid))
                fingers=[Finger(uid=f["uid"],fid=f["fid"],valid=f.get("valid",1),template=f["template"]) for f in fingers_data]
                self._zk.save_user_template(user=user,fingers=fingers)
            finally:
                if was: self.enable_device()
            self.log.log_operation("save_user_template",request=f"{len(fingers)}f",success=True,duration_ms=(time.time()-t0)*1000)
            return True
        except Exception as e: self.log.log_operation("save_user_template",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise

    def restart_device(self):
        try: self._zk.restart(); self._connected=False; self.log.log_operation("restart",success=True); return True
        except Exception as e: self.log.log_operation("restart",exception=e,success=False); raise

    def get_next_uid(self):
        try: users=self.get_users(); return max((u.uid for u in users),default=0)+1
        except Exception: return 1

    def __del__(self):
        try:
            if self._zk and self._connected: self.disconnect()
        except Exception: pass

    def get_attendance(self):
        t0=time.time()
        try:
            rec=self._zk.get_attendance()
            a2=[{"uid":a.user_id,"ts":str(a.timestamp),"s":a.status,"p":a.punch} for a in rec]
            self.log.log_operation("get_attendance",response=f"{len(rec)}rec",duration_ms=(time.time()-t0)*1000,success=True)
            return rec
        except Exception as e: self.log.log_operation("get_attendance",exception=e,duration_ms=(time.time()-t0)*1000,success=False); raise