"""Fix employment_type: convert PostgreSQL enum to VARCHAR(30)

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Remove the column default (references the enum type)
    op.execute(
        "ALTER TABLE employees ALTER COLUMN employment_type DROP DEFAULT"
    )

    # 2. Alter column from enum type to VARCHAR(30)
    op.execute(
        "ALTER TABLE employees ALTER COLUMN employment_type "
        "TYPE VARCHAR(30) USING employment_type::text"
    )

    # 3. Drop the old PostgreSQL enum type (no more dependencies)
    op.execute("DROP TYPE IF EXISTS employment_type")

    # 4. Update legacy data to match Python enum values
    op.execute(
        "UPDATE employees SET employment_type = 'full_time' "
        "WHERE employment_type = 'permanent'"
    )
    op.execute(
        "UPDATE employees SET employment_type = 'temporary' "
        "WHERE employment_type = 'casual'"
    )

    # 5. Set new default
    op.execute(
        "ALTER TABLE employees ALTER COLUMN employment_type "
        "SET DEFAULT 'full_time'"
    )


def downgrade():
    # Recreate the enum type (for rollback only)
    op.execute(
        "CREATE TYPE employment_type AS ENUM "
        "('permanent', 'contract', 'casual')"
    )
    op.execute(
        "ALTER TABLE employees ALTER COLUMN employment_type "
        "TYPE employment_type USING employment_type::employment_type"
    )
