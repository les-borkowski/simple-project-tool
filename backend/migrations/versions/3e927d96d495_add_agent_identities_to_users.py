"""add agent identities to users

Revision ID: 3e927d96d495
Revises: 03c518866193
Create Date: 2026-10-16 14:30:11.667297

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e927d96d495'
down_revision: Union[str, Sequence[str], None] = '03c518866193'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default 'human' backfills existing rows so the CHECK below holds for them.
    op.add_column('users', sa.Column('kind', sa.String(length=16), server_default='human', nullable=False))
    op.add_column('users', sa.Column('owner_id', sa.UUID(), nullable=True))
    op.alter_column('users', 'email', existing_type=sa.VARCHAR(length=255), nullable=True)
    op.alter_column('users', 'password_hash', existing_type=sa.VARCHAR(length=255), nullable=True)
    op.create_foreign_key(
        'users_owner_id_fkey', 'users', 'users', ['owner_id'], ['id'], ondelete='RESTRICT'
    )
    op.create_index(op.f('ix_users_owner_id'), 'users', ['owner_id'], unique=False)
    op.create_check_constraint(
        'ck_users_kind_shape',
        'users',
        "(kind = 'human' AND email IS NOT NULL AND password_hash IS NOT NULL AND owner_id IS NULL)"
        " OR (kind = 'agent' AND email IS NULL AND password_hash IS NULL AND owner_id IS NOT NULL)",
    )
    op.create_index(
        'uq_users_agent_owner_name',
        'users',
        ['owner_id', sa.literal_column('lower(name)')],
        unique=True,
        postgresql_where=sa.text("kind = 'agent'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Restoring NOT NULL on email/password_hash is impossible for agent rows.
    bind = op.get_bind()
    agents = bind.execute(sa.text("SELECT count(*) FROM users WHERE kind = 'agent'")).scalar_one()
    if agents:
        raise RuntimeError(
            f"Cannot downgrade: {agents} agent identities exist in users. Delete them first."
        )
    op.drop_index('uq_users_agent_owner_name', table_name='users', postgresql_where=sa.text("kind = 'agent'"))
    op.drop_constraint('ck_users_kind_shape', 'users', type_='check')
    op.drop_index(op.f('ix_users_owner_id'), table_name='users')
    op.drop_constraint('users_owner_id_fkey', 'users', type_='foreignkey')
    op.drop_column('users', 'owner_id')
    op.drop_column('users', 'kind')
    op.alter_column('users', 'password_hash', existing_type=sa.VARCHAR(length=255), nullable=False)
    op.alter_column('users', 'email', existing_type=sa.VARCHAR(length=255), nullable=False)
