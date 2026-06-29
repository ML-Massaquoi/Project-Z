"""Rodasoft Event Monitor"""
import time
from PySide6.QtCore import Signal, QThread
from core.logger import get_logger, get_event_logger

log=get_logger("event_monitor"); evlog=get_event_logger()

class EventMonitorWorker(QThread):
    event_received=Signal(str,str,str); status_update=Signal(str); error_occurred=Signal(str)
    def __init__(self,connector):
        super().__init__(); self.connector=connector; self._running=False; self._paused=False
    def pause(self): self._paused=True
    def resume(self): self._paused=False
    def stop(self): self._running=False
    def run(self):
        self._running=True; dn=self.connector.config.name
        self.status_update.emit(f"Monitoring {dn}"); log.info(f"Monitoring {dn}")
        evmap={1:"ATTENDANCE",2:"FINGER_CAPTURED",3:"ENROLLMENT",4:"ENROLL_FINGER",5:"BUTTON",6:"UNLOCK",7:"VERIFY",8:"FPMINUTIA"}
        while self._running:
            try:
                if not self.connector.is_connected:
                    self.error_occurred.emit("Not connected"); time.sleep(2); continue
                try: self.connector.reg_event(1|2|4|8|16|32|128)
                except Exception: pass
                for event in self.connector.live_capture(timeout=5):
                    if not self._running: break
                    if self._paused: time.sleep(0.1); continue
                    et=evmap.get(event.status,f"UNKNOWN_{event.status}")
                    d=f"U:{event.user_id} S:{event.status} T:{event.timestamp}"
                    evlog.log_event(et,dn,d); self.event_received.emit(et,dn,d)
                    log.info(f"[{dn}] {et}: {d}")
            except Exception as e:
                if self._running: self.error_occurred.emit(str(e)); time.sleep(2)
