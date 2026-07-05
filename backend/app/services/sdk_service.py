"""
Project Z - ZKTeco SDK Service
Connects to biometric devices via TCP port 4370 using pyzk.

Supports:
  - User management (CRUD)
  - Fingerprint template management (read/write/delete)
  - Device information and diagnostics
  - Live enrollment

IMPORTANT: ZKTeco devices only support ONE concurrent TCP connection.

ARCHITECTURE NOTE (2026-07-04):
  The new DeviceQueueManager (device_queue_manager.py) replaces the per-device
  asyncio.Lock pattern. It uses per-device DeviceWorker instances that each
  own a single TCP connection and process jobs from a priority queue.

  NEW CODE should use DeviceQueueManager instead of get_device_lock().
  The old get_device_lock() is retained for backward compatibility during
  migration but will be removed in a future cleanup.
"""

import asyncio
import logging
import time
from contextlib import contextmanager
from typing import Optional

logger = logging.getLogger(__name__)

# Deprecated: Use DeviceQueueManager instead.
# Per-device locks keyed by IP address to prevent concurrent TCP connections.
_device_locks: dict[str, asyncio.Lock] = {}


def get_device_lock(ip: str) -> asyncio.Lock:
    """
    DEPRECATED: Use DeviceQueueManager instead.

    Get or create an asyncio.Lock for a specific device IP.
    The new DeviceQueueManager uses per-device workers with priority queues
    instead of this per-device lock pattern.
    """
    if ip not in _device_locks:
        _device_locks[ip] = asyncio.Lock()
    return _device_locks[ip]


class ZKSDKService:
    """Handles direct TCP communication with ZKTeco devices via pyzk."""

    # Class-level set of device IPs currently in an enrollment session.
    # While enrolled, the polling worker skips these devices.
    _enrollment_active: set[str] = set()

    def __init__(self, ip: str, port: int = 4370, timeout: int = 10, password: int = 0):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.password = password
        self._conn = None

    @classmethod
    def mark_enrollment_active(cls, ip: str) -> None:
        """Mark a device as having an active enrollment session."""
        cls._enrollment_active.add(ip)
        logger.info(f"SDK: Enrollment marked active for {ip}")

    @classmethod
    def mark_enrollment_inactive(cls, ip: str) -> None:
        """Clear enrollment-active flag for a device."""
        cls._enrollment_active.discard(ip)
        logger.info(f"SDK: Enrollment cleared for {ip}")

    @classmethod
    def is_enrollment_active(cls, ip: str) -> bool:
        """Check if a device has an active enrollment session."""
        return ip in cls._enrollment_active

    def _get_connection(self):
        """Get or create a persistent connection to the device."""
        if self._conn is not None:
            return self._conn
        from zk import ZK
        zk = ZK(
            self.ip, port=self.port, timeout=self.timeout,
            password=self.password, force_udp=False, ommit_ping=True,
        )
        self._conn = zk.connect()
        return self._conn

    def _connect_with_retry(self, max_retries: int = 3, retry_delay: float = 1.0):
        """
        Connect to device with retry logic.
        Handles transient connection failures caused by device busy states
        or stale TCP sessions from prior connections.
        """
        import socket
        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                # Force a fresh connection each attempt
                self._conn = None
                conn = self._get_connection()
                logger.info(
                    f"SDK: Connected to {self.ip}:{self.port} "
                    f"(attempt {attempt}/{max_retries})"
                )
                return conn
            except Exception as e:
                last_error = e
                logger.warning(
                    f"SDK: Connection attempt {attempt}/{max_retries} "
                    f"to {self.ip}:{self.port} failed: {e}"
                )
                if attempt < max_retries:
                    # Wait before retry — gives device time to release prior session
                    time.sleep(retry_delay)
                    # Try to clean up any partial connection
                    try:
                        self.disconnect()
                    except Exception:
                        pass

        raise RuntimeError(
            f"Failed to connect to device {self.ip}:{self.port} "
            f"after {max_retries} attempts. Last error: {last_error}"
        )

    def disconnect(self):
        """Disconnect from device."""
        if self._conn:
            try:
                self._conn.enable_device()
                self._conn.disconnect()
            except Exception:
                pass
            self._conn = None

    # ── User Management ───────────────────────────────────────

    def get_users(self) -> list[dict]:
        """
        Retrieve all enrolled users from the device.
        Returns list of dicts with: user_id, name, privilege, uid, password, group_id, card
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            users = conn.get_users()
            conn.enable_device()

            result = []
            for u in users:
                result.append({
                    "user_id": str(u.user_id),
                    "name": u.name or f"User {u.user_id}",
                    "privilege": u.privilege,
                    "uid": u.uid,
                    "password": u.password or "",
                    "group_id": u.group_id or "",
                    "card": u.card or 0,
                })
            logger.info(f"SDK: Retrieved {len(result)} users from {self.ip}")
            return result

        except ImportError:
            raise RuntimeError("pyzk not installed. Run: pip install pyzk")
        except Exception as e:
            logger.error(f"SDK error connecting to {self.ip}:{self.port} — {e}")
            raise RuntimeError(f"Could not connect to device at {self.ip}:{self.port}. Error: {str(e)}")

    def set_user(
        self,
        uid: Optional[int] = None,
        name: str = "",
        privilege: int = 0,
        password: str = "",
        group_id: str = "",
        user_id: str = "",
        card: int = 0,
    ) -> bool:
        """
        Create or update a user on the device.
        If uid is None, auto-assigns next available uid.
        Returns True on success.
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            conn.set_user(
                uid=uid, name=name, privilege=privilege,
                password=password, group_id=group_id,
                user_id=user_id, card=card,
            )
            conn.enable_device()
            logger.info(f"SDK: Set user '{name}' (uid={uid}, user_id={user_id}) on {self.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK set_user error on {self.ip}: {e}")
            raise RuntimeError(f"Failed to set user on device {self.ip}: {str(e)}")

    def delete_user(self, uid: Optional[int] = None, user_id: str = "") -> bool:
        """
        Delete a user from the device by uid or user_id.
        Returns True on success.
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            conn.delete_user(uid=uid, user_id=user_id)
            conn.enable_device()
            logger.info(f"SDK: Deleted user (uid={uid}, user_id={user_id}) from {self.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK delete_user error on {self.ip}: {e}")
            raise RuntimeError(f"Failed to delete user from device {self.ip}: {str(e)}")

    # ── Fingerprint Template Management ───────────────────────

    def get_templates(self) -> list[dict]:
        """
        Retrieve ALL fingerprint templates from the device.
        Returns list of dicts with: uid, fid, valid, template (bytes), size
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            templates = conn.get_templates()
            conn.enable_device()

            result = []
            for t in templates:
                result.append({
                    "uid": t.uid,
                    "fid": t.fid,
                    "valid": t.valid,
                    "template": t.template,
                    "size": t.size,
                })
            logger.info(f"SDK: Retrieved {len(result)} templates from {self.ip}")
            return result
        except Exception as e:
            logger.error(f"SDK get_templates error on {self.ip}: {e}")
            raise RuntimeError(f"Failed to get templates from device {self.ip}: {str(e)}")

    def get_user_templates(self, uid: int) -> list[dict]:
        """
        Retrieve fingerprint templates for a specific user uid.
        Uses bulk get_templates() and filters, since per-user query
        doesn't work on ZMM220_TFT devices.
        """
        all_templates = self.get_templates()
        return [t for t in all_templates if t["uid"] == uid]

    def get_templates_light(self) -> list[dict]:
        """
        Lightweight template retrieval WITHOUT disable/enable device cycle.
        Used during polling to avoid blocking the device during enrollment.
        """
        try:
            conn = self._get_connection()
            templates = conn.get_templates()
            return [
                {
                    "uid": t.uid,
                    "fid": t.fid,
                    "valid": t.valid,
                    "template": t.template,
                    "size": t.size,
                }
                for t in templates
            ]
        except Exception as e:
            logger.error(f"SDK get_templates_light error on {self.ip}: {e}")
            raise

    def get_user_template(self, uid: int, temp_id: int = 0) -> Optional[dict]:
        """
        Retrieve a single fingerprint template for a specific user.
        Returns dict with template data or None.
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            template = conn.get_user_template(uid=uid, temp_id=temp_id)
            conn.enable_device()

            if template is None:
                return None
            return {
                "uid": template.uid,
                "fid": template.fid,
                "valid": template.valid,
                "template": template.template,
                "size": template.size,
            }
        except Exception as e:
            logger.error(f"SDK get_user_template error on {self.ip}: {e}")
            return None

    def save_user_template(self, user_uid: int, user_id: str, name: str, templates: list[dict]) -> bool:
        """
        Save a user and their fingerprint templates to the device.

        Args:
            user_uid: The device's internal user uid (or None for auto-assign)
            user_id: The user's PIN number
            name: Display name
            templates: List of dicts with 'fid' (finger index) and 'template' (bytes)

        Returns True on success.
        """
        try:
            from zk.user import User
            from zk.finger import Finger

            conn = self._get_connection()
            conn.disable_device()

            # Create the user object
            user = User(
                uid=user_uid,
                name=name,
                privilege=0,
                password="",
                group_id="",
                user_id=user_id,
                card=0,
            )

            # Create finger objects
            fingers = []
            for t in templates:
                finger = Finger(
                    uid=user_uid or 0,
                    fid=t["fid"],
                    valid=1,
                    template=t["template"],
                )
                fingers.append(finger)

            # Save user and templates together
            conn.save_user_template(user=user, fingers=fingers)
            conn.enable_device()

            logger.info(
                f"SDK: Saved user '{name}' with {len(fingers)} template(s) to {self.ip}"
            )
            return True
        except Exception as e:
            logger.error(f"SDK save_user_template error on {self.ip}: {e}")
            raise RuntimeError(f"Failed to save templates to device {self.ip}: {str(e)}")

    def delete_user_template(self, uid: int, temp_id: int) -> bool:
        """
        Delete a specific fingerprint template from the device.
        Returns True on success.
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            conn.delete_user_template(uid=uid, temp_id=temp_id)
            conn.enable_device()
            logger.info(f"SDK: Deleted template (uid={uid}, temp_id={temp_id}) from {self.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK delete_user_template error on {self.ip}: {e}")
            return False

    # ── Attendance ─────────────────────────────────────────────

    def get_attendance(self) -> list[dict]:
        """
        Retrieve all stored attendance records from the device.
        Returns list of dicts with: user_id, timestamp, status, punch
        """
        try:
            conn = self._get_connection()
            conn.disable_device()
            attendances = conn.get_attendance()
            conn.enable_device()

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

    # ── Device Information ─────────────────────────────────────

    def get_device_info(self) -> dict:
        """Get comprehensive device information."""
        try:
            conn = self._get_connection()
            info = {
                "serial_number": conn.get_serialnumber(),
                "firmware_version": conn.get_firmware_version(),
                "platform": conn.get_platform(),
                "mac": conn.get_mac(),
                "device_name": conn.get_device_name(),
                "face_version": conn.get_face_version(),
                "fp_version": conn.get_fp_version(),
                "pin_width": conn.get_pin_width(),
            }
            # Try to get network params
            try:
                net = conn.get_network_params()
                info["ip"] = net.get("ip", "")
                info["mask"] = net.get("mask", "")
                info["gateway"] = net.get("gateway", "")
            except Exception:
                pass

            # Try to get memory usage
            try:
                conn.read_sizes()
                info["users_count"] = conn.users
                info["users_capacity"] = conn.users_cap
                info["fingers_count"] = conn.fingers
                info["fingers_capacity"] = conn.fingers_cap
                info["records_count"] = conn.records
                info["records_capacity"] = conn.records_cap
            except Exception:
                pass

            logger.info(f"SDK: Got device info from {self.ip}: SN={info['serial_number']}")
            return info
        except Exception as e:
            logger.error(f"SDK get_device_info error on {self.ip}: {e}")
            raise RuntimeError(f"Failed to get device info from {self.ip}: {str(e)}")

    def get_firmware_version(self) -> str:
        """Get firmware version string."""
        try:
            conn = self._get_connection()
            return conn.get_firmware_version()
        except Exception:
            return ""

    def get_serialnumber(self) -> str:
        """Get device serial number."""
        try:
            conn = self._get_connection()
            return conn.get_serialnumber()
        except Exception:
            return ""

    # ── Device Control ─────────────────────────────────────────

    def restart(self) -> bool:
        """Restart the device remotely."""
        try:
            conn = self._get_connection()
            conn.restart()
            logger.info(f"SDK: Restarted device {self.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK restart error on {self.ip}: {e}")
            return False

    def clear_data(self) -> bool:
        """Clear ALL data on device (destructive!)."""
        try:
            conn = self._get_connection()
            conn.clear_data()
            logger.warning(f"SDK: Cleared ALL data on device {self.ip}")
            return True
        except Exception as e:
            logger.error(f"SDK clear_data error on {self.ip}: {e}")
            return False

    # ── Live Enrollment ────────────────────────────────────────

    def enroll_user(self, uid: int = 0, temp_id: int = 0, user_id: str = "") -> bool:
        """
        Initiate a live fingerprint enrollment session.
        The device will prompt the user to place their finger.
        Returns True if enrollment succeeded.

        IMPORTANT: Uses the existing connection (_get_connection) rather than
        _connect_with_retry, because creating a new TCP session while the
        previous one is still alive causes the device to reject the command.
        """
        try:
            conn = self._get_connection()
            result = conn.enroll_user(uid=uid, temp_id=temp_id, user_id=user_id)
            logger.info(f"SDK: Live enrollment result on {self.ip}: {result}")
            return result
        except Exception as e:
            logger.error(f"SDK enroll_user error on {self.ip}: {e}")
            return False

    def enroll_face(self, uid: int = 0, user_id: str = "") -> bool:
        """
        Initiate a face enrollment session on the device.

        Sends STARTENROLL command with face biometric flag (2) to trigger
        the device's face capture mode. The device will prompt the user to
        look at the camera.

        Note: This method triggers face enrollment but does NOT receive
        face template data back (the device stores it locally).

        IMPORTANT: Uses the existing connection via _get_connection.
        """
        try:
            conn = self._get_connection()
            from zk import const
            from struct import pack

            if not user_id:
                users = conn.get_users()
                users = [u for u in users if u.uid == uid]
                if users:
                    user_id = users[0].user_id
                else:
                    logger.warning(f"enroll_face: uid {uid} not found on {self.ip}")
                    return False

            conn.cancel_capture()

            if conn.tcp:
                command_string = pack('<24sbb', str(user_id).encode(), 0, 2)
            else:
                command_string = pack('<Ib', int(user_id), 2)

            cmd_response = conn._ZK__send_command(const.CMD_STARTENROLL, command_string)
            if not cmd_response.get('status'):
                logger.warning(f"enroll_face: device rejected face enrollment on {self.ip}")
                return False

            logger.info(f"Face enrollment triggered on {self.ip} for user {user_id}")
            return True

        except Exception as e:
            logger.error(f"enroll_face error on {self.ip}: {e}")
            return False

    def test_connection(self) -> dict:
        """
        Test connectivity to the device. Returns diagnostic info.
        Useful for debugging connection issues.
        """
        import socket
        result = {
            "ip": self.ip,
            "port": self.port,
            "tcp_reachable": False,
            "sdk_connectable": False,
            "error": None,
        }

        # Step 1: TCP port probe
        try:
            with socket.create_connection((self.ip, self.port), timeout=3):
                result["tcp_reachable"] = True
        except Exception as e:
            result["error"] = f"TCP port not reachable: {e}"
            return result

        # Step 2: SDK connect
        try:
            conn = self._connect_with_retry(max_retries=2, retry_delay=1.0)
            result["sdk_connectable"] = True
            self.disconnect()
        except Exception as e:
            result["error"] = f"SDK connect failed: {e}"

        return result
