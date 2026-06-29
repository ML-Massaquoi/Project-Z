"""Add employee_number sequence for thread-safe ID generation

Revision ID: 0029
Revises: 0028
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade():
    # Create a sequence for employee_number generation
    # Starting at 1000 to avoid collision with existing manual numbers
    op.execute("""
        DO $$
        DECLARE
            max_num INTEGER;
        BEGIN
            SELECT COALESCE(MAX(CAST(employee_number AS INTEGER)), 0)
            INTO max_num
            FROM employees
            WHERE employee_number ~ '^\d+$';

            IF max_num < 1000 THEN
                max_num := 999;
            END IF;

            EXECUTE format(
                'CREATE SEQUENCE IF NOT EXISTS employee_number_seq START WITH %s',
                max_num + 1
            );
        END $$;
    """)


def downgrade():
    op.execute("DROP SEQUENCE IF EXISTS employee_number_seq")
