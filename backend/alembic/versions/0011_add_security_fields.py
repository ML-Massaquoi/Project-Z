"""Add security fields to users table

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0011'
down_revision = '0010_employee_shift_protocol'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add failed_login_attempts column
    op.add_column('users', sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False))
    
    # Add locked_until column
    op.add_column('users', sa.Column('locked_until', sa.String(50), nullable=True))
    
    # Update RoleType enum to include new roles
    # First, create the new enum type
    op.execute("ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'ict_administrator'")
    op.execute("ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'hr_administrator'")
    op.execute("ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'operations_manager'")
    op.execute("ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'department_supervisor'")


def downgrade() -> None:
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
