"""
Project Z - Structured Logging Configuration
JSON-formatted structured logging with correlation ID context propagation.
"""

import json
import logging
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add correlation ID if present
        correlation_id = getattr(record, "correlation_id", None)
        if correlation_id:
            log_entry["correlation_id"] = correlation_id

        # Add request context if present
        method = getattr(record, "request_method", None)
        path = getattr(record, "request_path", None)
        if method and path:
            log_entry["request"] = {"method": method, "path": path}

        status_code = getattr(record, "status_code", None)
        if status_code:
            log_entry["status_code"] = status_code

        elapsed_ms = getattr(record, "elapsed_ms", None)
        if elapsed_ms is not None:
            log_entry["elapsed_ms"] = elapsed_ms

        client_ip = getattr(record, "client_ip", None)
        if client_ip:
            log_entry["client_ip"] = client_ip

        # Add exception info if present
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info),
            }

        # Add extra fields
        for key in ("worker", "device_id", "employee_id", "user_id", "action", "entity_type"):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        return json.dumps(log_entry, default=str)


class ColorFormatter(logging.Formatter):
    """
    Human-readable formatter with ANSI color support for development.
    Uses colors per log level plus special green highlighting for heartbeats.
    """

    # ANSI escape codes
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    GREEN   = "\033[92m"   # bright green
    YELLOW  = "\033[93m"   # bright yellow
    RED     = "\033[91m"   # bright red
    CYAN    = "\033[96m"   # bright cyan
    GREY    = "\033[90m"   # dark grey
    WHITE   = "\033[97m"   # bright white

    LEVEL_COLORS = {
        "DEBUG":    "\033[90m",   # grey
        "INFO":     "\033[97m",   # white
        "WARNING":  "\033[93m",   # yellow
        "ERROR":    "\033[91m",   # red
        "CRITICAL": "\033[95m",   # magenta
    }

    def format(self, record: logging.LogRecord) -> str:
        correlation_id = getattr(record, "correlation_id", None)
        prefix = f"[{correlation_id}] " if correlation_id else ""

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        level_color = self.LEVEL_COLORS.get(record.levelname, self.RESET)
        level = f"{record.levelname:<8}"
        name = record.name
        message = record.getMessage()

        # Heartbeat lines get full green treatment
        is_heartbeat = "[HEARTBEAT]" in message or "[200]" in message

        if is_heartbeat:
            line = (
                f"{self.GREY}{timestamp}{self.RESET} | "
                f"{self.GREEN}{self.BOLD}{level}{self.RESET} | "
                f"{self.GREY}{name}{self.RESET} | "
                f"{self.GREEN}{prefix}{message}{self.RESET}"
            )
        else:
            line = (
                f"{self.GREY}{timestamp}{self.RESET} | "
                f"{level_color}{level}{self.RESET} | "
                f"{self.GREY}{name}{self.RESET} | "
                f"{prefix}{message}"
            )

        if record.exc_info and record.exc_info[0]:
            line += f"\n{self.formatException(record.exc_info)}"

        return line

    def emit(self, record: logging.LogRecord) -> None:
        try:
            super().emit(record)
            self.flush()
        except Exception:
            self.handleError(record)


class FlushStreamHandler(logging.StreamHandler):
    """StreamHandler that flushes after every emit to prevent buffering issues."""

    def __init__(self, stream=None):
        import io
        if stream is None:
            stream = io.TextIOWrapper(
                sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
            )
        super().__init__(stream)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            super().emit(record)
            self.flush()
        except Exception:
            self.handleError(record)


def setup_logging(debug: bool = False, json_format: bool = False) -> None:
    """
    Configure application logging.

    Args:
        debug: Enable DEBUG level logging
        json_format: Use JSON structured logging (recommended for production)
    """
    level = logging.DEBUG if debug else logging.INFO

    if json_format:
        formatter = JSONFormatter()
    else:
        formatter = ColorFormatter()

    # Console handler with auto-flush
    console_handler = FlushStreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers to prevent duplicates
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)

    # Quieten noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.ERROR)  # suppress bcrypt version warning
