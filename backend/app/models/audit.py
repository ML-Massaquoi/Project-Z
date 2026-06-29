"""
Project Z - Audit Log Model
Tracks all system mutations for compliance and debugging.
"""

import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import BaseModel


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at_entity", "created_at", "entity_type"),
        Index("ix_audit_logs_user_action", "user_id", "action"),
    )

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    username: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, index=True,
        comment="Denormalized username for fast queries without JOIN",
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    previous_value: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Entity state before the mutation",
    )
    new_value: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Entity state after the mutation",
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    endpoint: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="API endpoint path, e.g. /api/v1/employees/{id}",
    )
    request_method: Mapped[Optional[str]] = mapped_column(
        String(10), nullable=True,
        comment="HTTP method: GET, POST, PUT, DELETE, PATCH",
    )

    def __repr__(self) -> str:
        return f"<AuditLog(action='{self.action}', entity='{self.entity_type}')>"
