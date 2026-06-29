"""
Project Z - FingerprintTemplate Model
Central biometric template repository.

Stores fingerprint (and future biometric) templates centrally.
Templates are pulled from devices and pushed to devices as needed.
This is the authoritative source for all biometric data.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import BaseModel

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.employee import Employee


class BiometricType(str, enum.Enum):
    FINGERPRINT = "fingerprint"
    FACE = "face"
    PALM = "palm"
    RFID = "rfid"
    PIN = "pin"


class SyncStatus(str, enum.Enum):
    SYNCED = "synced"
    PENDING = "pending"
    FAILED = "failed"
    OUTDATED = "outdated"


class FingerprintTemplate(BaseModel):
    """
    A biometric template stored in the central repository.

    Each row represents one fingerprint (or future biometric type)
    for one employee. The template_data column holds the raw binary
    template that can be pushed to any device.
    """

    __tablename__ = "fingerprint_templates"
    __table_args__ = (
        UniqueConstraint(
            "employee_id", "finger_index", "biometric_type",
            name="uq_fptemplates_employee_finger_type",
        ),
        Index("ix_fptemplates_employee_biometric", "employee_id", "biometric_type"),
        Index("ix_fptemplates_device_biometric", "device_id", "biometric_type"),
        Index("ix_fptemplates_hash", "template_hash"),
        Index("ix_fptemplates_sync_status", "sync_status"),
    )

    # ── Core identity ─────────────────────────────────────────
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        comment="Device this template was originally pulled from",
    )
    device_user_id: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="User ID on the source biometric device",
    )

    # ── Biometric data ────────────────────────────────────────
    biometric_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BiometricType.FINGERPRINT.value,
        comment="fingerprint, face, palm, rfid, pin",
    )
    finger_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Finger index (0-9) or template slot",
    )
    template_data: Mapped[Optional[bytes]] = mapped_column(
        LargeBinary(), nullable=True,
        comment="Raw binary biometric template data",
    )
    template_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Size of template data in bytes",
    )
    template_hash: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True,
        comment="SHA-256 hash of template_data for dedup and change detection",
    )
    template_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1,
        comment="Version counter, incremented on each update",
    )
    quality: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0,
        comment="Template quality score (0-100)",
    )

    # ── Source tracking ───────────────────────────────────────
    source_device_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
        comment="Serial number of the device this template was originally enrolled on",
    )

    # ── Sync state ────────────────────────────────────────────
    sync_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SyncStatus.SYNCED.value,
        comment="synced, pending, failed, outdated",
    )
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
        comment="When this template was last synced to/from a device",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
        comment="Soft delete flag",
    )

    # ── Relationships ─────────────────────────────────────────
    employee: Mapped["Employee"] = relationship("Employee", lazy="select")
    device: Mapped["Device"] = relationship("Device", lazy="select")

    def __repr__(self) -> str:
        return (
            f"<FingerprintTemplate(employee={self.employee_id}, "
            f"type={self.biometric_type}, finger={self.finger_index}, "
            f"size={self.template_size}, sync={self.sync_status})>"
        )

    @property
    def has_template_data(self) -> bool:
        """Check if this template has actual binary data stored."""
        return self.template_data is not None and self.template_size > 0
