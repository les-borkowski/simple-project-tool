"""add_is_default_to_stories_and_backlog

Revision ID: a164c9b673e0
Revises: c285cfb6a1be
Create Date: 2026-04-26 14:28:33.535880

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a164c9b673e0'
down_revision: Union[str, Sequence[str], None] = 'c285cfb6a1be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add is_default column with server_default so existing rows get false
    op.add_column(
        'stories',
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Create a Backlog story for every existing project and reassign orphan tasks
    projects = conn.execute(
        sa.text("SELECT id, owner_id, status FROM projects")
    ).fetchall()

    for project in projects:
        project_id = project[0]
        owner_id = project[1]
        status = project[2] or 'to_do'
        backlog_id = uuid.uuid4()

        conn.execute(
            sa.text(
                "INSERT INTO stories (id, project_id, is_default, title, status, priority, created_by, created_at, updated_at) "
                "VALUES (:id, :project_id, true, 'Backlog', :status, 'medium', :created_by, now(), now())"
            ),
            {"id": backlog_id, "project_id": project_id, "status": status, "created_by": owner_id},
        )

        conn.execute(
            sa.text(
                "UPDATE tasks SET story_id = :backlog_id "
                "WHERE project_id = :project_id AND story_id IS NULL"
            ),
            {"backlog_id": backlog_id, "project_id": project_id},
        )

    # Now safe to create the partial unique index
    op.create_index(
        'uq_story_default_per_project',
        'stories',
        ['project_id'],
        unique=True,
        postgresql_where=sa.text('is_default = true'),
    )

    # Remove the server_default now that data is populated
    op.alter_column('stories', 'is_default', server_default=None)


def downgrade() -> None:
    op.drop_index('uq_story_default_per_project', table_name='stories', postgresql_where=sa.text('is_default = true'))
    op.drop_column('stories', 'is_default')
