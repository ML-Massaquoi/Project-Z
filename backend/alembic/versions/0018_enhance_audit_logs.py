"""Enhance audit_logs with previous/new values, username, endpoint, method

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-19 10:00:00.000000

Adds columns for comprehensive audit trail:
- username (denormalized for fast queries)
- previous_value / new_value (JSONB for before/after snapshots)
- endpoint / request_method (HTTP context)
- Composite indexes for common query patterns
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns
    op.add_column(
        "audit_logs",
        sa.Column("username", sa.String(100), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("previous_value", JSONB, nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("new_value", JSONB, nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("endpoint", sa.String(200), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("request_method", sa.String(10), nullable=True),
    )

    # Add indexes for common query patterns
    op.create_index(
        "ix_audit_logs_username",
        "audit_logs",
        ["username"],
    )
    op.create_index(
        "ix_audit_logs_created_at_entity",
        "audit_logs",
        ["created_at", "entity_type"],
    )
    op.create_index(
        "ix_audit_logs_user_action",
        "audit_logs",
        ["user_id", "action"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_user_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_created_at_entity", table_name="audit_logs")
    op.drop_index("ix_audit_logs_username", table_name="audit_logs")
    op.drop_column("audit_logs", "request_method")
    op.drop_column("audit_logs", "endpoint")
    op.drop_column("audit_logs", "new_value")
    op.drop_column("audit_logs", "previous_value")
    op.drop_column("audit_logs", "username")
