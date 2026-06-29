"""Fix locked_until column type from String to DateTime

Revision ID: 0012
Revises: 0011
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert locked_until from VARCHAR(50) to TIMESTAMP WITH TIME ZONE
    # First, create a temporary column with the correct type
    op.add_column('users', sa.Column('locked_until_new', sa.DateTime(timezone=True), nullable=True))

    # Copy data from old column to new column, converting ISO strings to timestamps
    op.execute("""
        UPDATE users
        SET locked_until_new = CASE
            WHEN locked_until IS NOT NULL AND locked_until != ''
            THEN locked_until::timestamp with time zone
            ELSE NULL
        END
    """)

    # Drop old column and rename new column
    op.drop_column('users', 'locked_until')
    op.alter_column('users', 'locked_until_new', new_column_name='locked_until')


def downgrade() -> None:
    # Convert back to VARCHAR(50) - this may lose timezone info
    op.add_column('users', sa.Column('locked_until_old', sa.String(50), nullable=True))

    op.execute("""
        UPDATE users
        SET locked_until_old = CASE
            WHEN locked_until IS NOT NULL
            THEN locked_until::text
            ELSE NULL
        END
    """)

    op.drop_column('users', 'locked_until')
    op.alter_column('users', 'locked_until_old', new_column_name='locked_until')
