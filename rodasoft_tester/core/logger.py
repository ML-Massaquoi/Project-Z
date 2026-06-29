"""
Rodasoft Device Capability Verification Tool
Core Logging Module

Every operation is logged with full detail:
- Timestamp, Request, Response, Duration
- Success/Failure, Exception, Raw SDK output
"""
import os, json, logging, traceback
from datetime import datetime
from typing import Optional, Any

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")

def ensure_log_dir():
    os.makedirs(LOG_DIR, exist_ok=True)

class OperationLogger:
    """Logs every SDK operation with full detail."""
    def __init__(self, component: str):
        ensure_log_dir()
        self.component = component
        self.log_file = os.path.join(LOG_DIR, f"{component}.log")
        self.json_log_file = os.path.join(LOG_DIR, f"{component}_structured.jsonl")
        self._logger = logging.getLogger(f"rodasoft.{component}")
        self._logger.setLevel(logging.DEBUG)
        fh = logging.FileHandler(self.log_file, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
        fh.setFormatter(formatter)
        if not self._logger.handlers:
            self._logger.addHandler(fh)

    def log_operation(self, operation, request=None, response=None, duration_ms=None, success=False, exception=None, raw_output=None, extra=None):
        timestamp = datetime.now().isoformat()
        tb_str = None
        if exception:
            import sys
            _, exc_val, exc_tb = sys.exc_info()
            if exc_val:
                tb_str = "".join(traceback.format_exception(type(exc_val), exc_val, exc_tb))
        log_entry = {"timestamp": timestamp, "component": self.component, "operation": operation, "request": self._serialize(request), "response": self._serialize(response), "duration_ms": duration_ms, "success": success, "exception": self._serialize(exception), "traceback": tb_str, "raw_output": self._serialize(raw_output)}
        if extra: log_entry.update(extra)
        try:
            with open(self.json_log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry, default=str, ensure_ascii=False) + "\n")
        except Exception: pass
        status = "SUCCESS" if success else "FAILURE"
        dstr = f" [{duration_ms:.0f}ms]" if duration_ms is not None else ""
        estr = f" | EXCEPTION: {exception}" if exception else ""
        msg = f"[{status}]{dstr} {operation} | REQ: {self._summarize(request, 200)} | RES: {self._summarize(response, 200)}{estr}"
        if success: self._logger.info(msg)
        else: self._logger.error(msg)
        if raw_output is not None: self._logger.debug(f"RAW: {self._summarize(raw_output, 500)}")
        return log_entry

    def _serialize(self, obj):
        if obj is None: return None
        if isinstance(obj, (str, int, float, bool)): return obj
        if isinstance(obj, bytes): return obj.hex()
        if isinstance(obj, Exception): return f"{type(obj).__name__}: {str(obj)}"
        try: return str(obj)
        except: return f"<{type(obj).__name__}: unprintable>"

    def _summarize(self, obj, max_len=200):
        s = self._serialize(obj)
        if s is None: return "None"
        s = str(s)
        return s[:max_len] + "..." if len(s) > max_len else s

    def info(self, m): self._logger.info(m)
    def debug(self, m): self._logger.debug(m)
    def warning(self, m): self._logger.warning(m)
    def error(self, m): self._logger.error(m)

class EventLogger:
    """Logs device events."""
    def __init__(self):
        ensure_log_dir()
        self.log_file = os.path.join(LOG_DIR, "device_events.log")
        self.jsonl_file = os.path.join(LOG_DIR, "device_events_structured.jsonl")

    def log_event(self, event_type, device_name, data=None):
        ts = datetime.now().isoformat()
        entry = {"timestamp": ts, "event_type": event_type, "device_name": device_name, "data": str(data) if data else None}
        try:
            with open(self.jsonl_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str, ensure_ascii=False) + "\n")
        except Exception: pass
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] [{device_name}] {event_type}")
                if data: f.write(f" | {data}")
                f.write("\n")
        except Exception: pass
        return entry

_op_loggers = {}
_ev_logger = None

def get_logger(component):
    if component not in _op_loggers:
        _op_loggers[component] = OperationLogger(component)
    return _op_loggers[component]

def get_event_logger():
    global _ev_logger
    if _ev_logger is None:
        _ev_logger = EventLogger()
    return _ev_logger
