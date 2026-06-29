"""
Multi-Vendor Device Driver Interface.

Abstract interface for device communication, allowing future
support for different biometric device manufacturers.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class DeviceInfo:
    """Device information returned by driver."""
    serial_number: str
    model: str
    firmware: str
    platform: str
    user_count: int
    template_count: int
    fingerprint_version: Optional[str] = None


@dataclass
class DeviceUser:
    """User information from device."""
    uid: int
    name: str
    privilege: int  # 0=user, 1=admin
    password: str
    group_id: int
    user_id: str  # External employee code


@dataclass
class DeviceFinger:
    """Fingerprint template from device."""
    uid: int
    fid: int  # Finger index (0-9)
    valid: int
    template: bytes


@dataclass
class DeviceAttendance:
    """Attendance record from device."""
    uid: int
    timestamp: str
    status: int  # 0=in, 1=out
    verify: int  # 0=password, 1=fingerprint, 2=face


class DeviceDriver(ABC):
    """
    Abstract base class for device communication drivers.

    Implement this interface to support new device manufacturers.
    Each driver handles the protocol-specific communication.
    """

    @abstractmethod
    def connect(self, ip: str, port: int = 4370, timeout: int = 10) -> bool:
        """Connect to device. Returns True if successful."""
        pass

    @abstractmethod
    def disconnect(self) -> None:
        """Disconnect from device."""
        pass

    @abstractmethod
    def get_device_info(self) -> Optional[DeviceInfo]:
        """Get device information."""
        pass

    @abstractmethod
    def get_users(self) -> list[DeviceUser]:
        """Get all users from device."""
        pass

    @abstractmethod
    def get_user_templates(self, uid: int) -> list[DeviceFinger]:
        """Get all fingerprint templates for a user."""
        pass

    @abstractmethod
    def save_user_template(
        self,
        uid: int,
        fid: int,
        valid: int,
        template: bytes,
    ) -> bool:
        """Save a fingerprint template to device."""
        pass

    @abstractmethod
    def delete_user_template(self, uid: int, fid: int) -> bool:
        """Delete a fingerprint template from device."""
        pass

    @abstractmethod
    def get_attendance(self) -> list[DeviceAttendance]:
        """Get attendance records from device."""
        pass

    @abstractmethod
    def clear_attendance(self) -> bool:
        """Clear attendance records from device."""
        pass

    @abstractmethod
    def restart(self) -> bool:
        """Restart the device."""
        pass

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Check if currently connected."""
        pass

    @property
    @abstractmethod
    def vendor_name(self) -> str:
        """Return the vendor/manufacturer name."""
        pass


class RodasoftZKDriver(DeviceDriver):
    """
    Rodasoft/ZKTeco device driver using pyzk SDK.
    Supports: Rodasoft MX-710, ZKTeco compatible devices.
    """

    def __init__(self):
        self._zk = None
        self._connected = False

    def connect(self, ip: str, port: int = 4370, timeout: int = 10) -> bool:
        try:
            from zk import ZK
            self._zk = ZK(ip, port=port, timeout=timeout)
            self._zk.connect()
            self._connected = True
            return True
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] Connection failed: {e}")
            self._connected = False
            return False

    def disconnect(self) -> None:
        if self._zk and self._connected:
            try:
                self._zk.disconnect()
            except Exception:
                pass
            self._connected = False

    def get_device_info(self) -> Optional[DeviceInfo]:
        if not self._connected or not self._zk:
            return None
        try:
            info = self._zk.get_device_info()
            return DeviceInfo(
                serial_number=info.get("serialnumber", ""),
                model=info.get("model", ""),
                firmware=info.get("firmware", ""),
                platform=info.get("platform", ""),
                user_count=info.get("user_count", 0),
                template_count=info.get("fp_count", 0),
                fingerprint_version=info.get("fp_version"),
            )
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] get_device_info failed: {e}")
            return None

    def get_users(self) -> list[DeviceUser]:
        if not self._connected or not self._zk:
            return []
        try:
            users = self._zk.get_users()
            return [
                DeviceUser(
                    uid=u.uid,
                    name=u.name or "",
                    privilege=u.privilege,
                    password=u.password or "",
                    group_id=u.group_id,
                    user_id=u.user_id or "",
                )
                for u in users
            ]
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] get_users failed: {e}")
            return []

    def get_user_templates(self, uid: int) -> list[DeviceFinger]:
        if not self._connected or not self._zk:
            return []
        try:
            templates = self._zk.get_user_template(uid=uid)
            return [
                DeviceFinger(
                    uid=t.uid,
                    fid=t.fid,
                    valid=t.valid,
                    template=t.template,
                )
                for t in templates
                if t.template
            ]
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] get_user_templates failed: {e}")
            return []

    def save_user_template(
        self,
        uid: int,
        fid: int,
        valid: int,
        template: bytes,
    ) -> bool:
        if not self._connected or not self._zk:
            return False
        try:
            from zk.user import User
            from zk.finger import Finger

            user = User(uid=uid, privilege=0, password="")
            finger = Finger(uid=uid, fid=fid, valid=valid, template=template)
            self._zk.save_user_template(user, fingers=[finger])
            return True
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] save_user_template failed: {e}")
            return False

    def delete_user_template(self, uid: int, fid: int) -> bool:
        if not self._connected or not self._zk:
            return False
        try:
            self._zk.delete_user_template(uid, fid)
            return True
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] delete_user_template failed: {e}")
            return False

    def get_attendance(self) -> list[DeviceAttendance]:
        if not self._connected or not self._zk:
            return []
        try:
            attendances = self._zk.get_attendance()
            return [
                DeviceAttendance(
                    uid=a.uid,
                    timestamp=a.timestamp,
                    status=a.status,
                    verify=a.verify,
                )
                for a in attendances
            ]
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] get_attendance failed: {e}")
            return []

    def clear_attendance(self) -> bool:
        if not self._connected or not self._zk:
            return False
        try:
            self._zk.clear_attendance()
            return True
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] clear_attendance failed: {e}")
            return False

    def restart(self) -> bool:
        if not self._connected or not self._zk:
            return False
        try:
            self._zk.restart()
            return True
        except Exception as e:
            logger.error(f"[RodasoftZKDriver] restart failed: {e}")
            return False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def vendor_name(self) -> str:
        return "Rodasoft/ZKTeco"


# ── Driver Registry ─────────────────────────────────────────

_DRIVER_REGISTRY: dict[str, type[DeviceDriver]] = {
    "rodasoft": RodasoftZKDriver,
    "zkteco": RodasoftZKDriver,  # Alias
}


def register_driver(vendor: str, driver_class: type[DeviceDriver]):
    """Register a new device driver for a vendor."""
    _DRIVER_REGISTRY[vendor.lower()] = driver_class
    logger.info(f"[DeviceDriver] Registered driver for vendor: {vendor}")


def get_driver(vendor: str = "rodasoft") -> DeviceDriver:
    """Get a device driver instance for the specified vendor."""
    driver_class = _DRIVER_REGISTRY.get(vendor.lower())
    if not driver_class:
        raise ValueError(f"No driver registered for vendor: {vendor}. Available: {list(_DRIVER_REGISTRY.keys())}")
    return driver_class()


def list_available_vendors() -> list[str]:
    """List all registered vendor names."""
    return list(_DRIVER_REGISTRY.keys())
