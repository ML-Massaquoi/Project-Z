"""
Project Z - ZKTeco SDK Service
Connects to biometric devices via TCP port 4370 using pyzk.
Used for importing enrolled users and historical attendance data.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ZKSDKService:
    """Handles direct TCP communication with ZKTeco devices via pyzk."""

    def __init__(self, ip: str, port: int = 4370, timeout: int = 10, password: int = 0):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.password = password

    def get_users(self) -> list[dict]:
        """
        Connect to device and retrieve all enrolled users.
        Returns list of dicts with: user_id, name, privilege, password, group_id, user_id_str
        """
        try:
            from zk import ZK
            zk = ZK(self.ip, port=self.port, timeout=self.timeout, password=self.password, force_udp=False, ommit_ping=True)
            conn = zk.connect()
            conn.disable_device()
            users = conn.get_users()
            conn.enable_device()
            conn.disconnect()

            result = []
            for u in users:
                result.append({
                    "user_id": str(u.user_id),
                    "name": u.name or f"User {u.user_id}",
                    "privilege": u.privilege,
                    "uid": u.uid,
                })
            logger.info(f"SDK: Retrieved {len(result)} users from {self.ip}")
            return result

        except ImportError:
            raise RuntimeError("pyzk not installed. Run: pip install pyzk")
        except Exception as e:
            logger.error(f"SDK error connecting to {self.ip}:{self.port} — {e}")
            raise RuntimeError(f"Could not connect to device at {self.ip}:{self.port}. Error: {str(e)}")

    def get_attendance(self) -> list[dict]:
        """
        Retrieve all stored attendance records from the device.
        Returns list of dicts with: user_id, timestamp, status, punch
        """
        try:
            from zk import ZK
            zk = ZK(self.ip, port=self.port, timeout=self.timeout, password=self.password, force_udp=False, ommit_ping=True)
            conn = zk.connect()
            conn.disable_device()
            attendances = conn.get_attendance()
            conn.enable_device()
            conn.disconnect()

            result = []
            for a in attendances:
                result.append({
                    "user_id": str(a.user_id),
                    "timestamp": a.timestamp,
                    "status": a.status,
                    "punch": a.punch,
                })
            logger.info(f"SDK: Retrieved {len(result)} attendance records from {self.ip}")
            return result

        except ImportError:
            raise RuntimeError("pyzk not installed")
        except Exception as e:
            logger.error(f"SDK attendance error: {e}")
            raise RuntimeError(f"Could not retrieve attendance from {self.ip}: {str(e)}")
