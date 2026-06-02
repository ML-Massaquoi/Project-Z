"""
Project Z - ScanEvent Model
Immutable raw biometric scan event store (Layer 1).
Partitioned by month on scan_timestamp.

CRITICAL: scan_result and scan_timestamp are IMMUTABLE after insert.
Only processing_status and websocket_broadcasted may be updated post-insert.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, SmallInteger, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class ScanResult(str, enum.Enum):
    SUCCESSFUL = "successful"
    DUPLICATE = "duplicate"
    UNKNOWN_USER = "unknown_user"
    UNKNOWN_DEVICE = "unknown_device"
    REJECTED = "rejected"
    MOVEMENT = "movement"
    RETRY = "retry"


class ProcessingStatusV2(str, enum.Enum):
    PENDING = "pending"
    QUEUED = "queued"
    QUEUED_OFFLINE = "queued_offline"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    FAILED_PERMANENT = "failed_permanent"
    OUT_OF_WINDOW = "out_of_window"


class VerificationMethod(str, enum.Enum):
    FINGERPRINT = "fingerprint"
    FACE = "face"
    CARD = "card"
    PASSWORD = "password"
    OTHER = "other"


class ScanEvent(BaseModel):
    """
    Immutable raw biometric scan event.
    Partitioned by RANGE (scan_timestamp) — monthly partitions.
    updated_at column exists in DB (added via ALTER TABLE).
    """
    __tablename__ = "scan_events"
    __table_args__ = {"postgresql_partition_by": "RANGE (scan_timestamp)"}

    # Employee context (nullable for unknown users)
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    employee_code: Mapped[str] = mapped_column(String(50), nullable=False, default="UNKNOWN")
    employee_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    department_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Unassigned")
    office_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    office_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Unassigned")

    # Device context
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    device_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Unknown Device")
    device_serial: Mapped[str] = mapped_column(String(100), nullable=False)

    # Scan data — IMMUTABLE after insert
    verification_method: Mapped[VerificationMethod] = mapped_column(
        SAEnum(VerificationMethod, name="verification_method",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=VerificationMethod.FINGERPRINT,
    )
    scan_result: Mapped[ScanResult] = mapped_column(
        SAEnum(ScanResult, name="scan_result",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    raw_punch_state: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    scan_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # Processing state — MUTABLE post-insert
    processing_status: Mapped[ProcessingStatusV2] = mapped_column(
        SAEnum(ProcessingStatusV2, name="processing_status_v2",
               values_callable=lambda x: [e.value for e in x]),
        nullable=False, default=ProcessingStatusV2.PENDING, index=True,
    )
    websocket_broadcasted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Future extensibility
    latitude: Mapped[Optional[Decimal]] = mapped_column("latitude", nullable=True)
    longitude: Mapped[Optional[Decimal]] = mapped_column("longitude", nullable=True)

    def __repr__(self) -> str:
        return (
            f"<ScanEvent(id={self.id}, employee={self.employee_code}, "
            f"result={self.scan_result}, ts={self.scan_timestamp})>"
        )
