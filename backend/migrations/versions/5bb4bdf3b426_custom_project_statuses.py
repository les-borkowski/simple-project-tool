"""custom_project_statuses

Revision ID: 5bb4bdf3b426
Revises: 7d0f629b8a5f
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '5bb4bdf3b426'
down_revision = '7d0f629b8a5f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create project_statuses table
    op.create_table(
        "project_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("colour", sa.String(20), nullable=False),
        sa.Column("order", sa.Integer, nullable=False),
    )
    op.create_index("ix_project_statuses_project_id", "project_statuses", ["project_id"])
    op.create_unique_constraint(
        "uq_project_statuses_project_slug", "project_statuses", ["project_id", "slug"]
    )

    # 2. Seed 4 default statuses for every existing project
    conn = op.get_bind()
    projects = conn.execute(sa.text("SELECT id FROM projects")).fetchall()
    defaults = [
        ("to_do",       "To Do",       "#6b7280", 0),
        ("in_progress", "In Progress", "#3b82f6", 1),
        ("in_review",   "In Review",   "#f59e0b", 2),
        ("done",        "Done",        "#22c55e", 3),
    ]
    for (project_id,) in projects:
        for slug, name, colour, order in defaults:
            conn.execute(
                sa.text(
                    'INSERT INTO project_statuses (id, project_id, slug, name, colour, "order") '
                    "VALUES (gen_random_uuid(), :pid, :slug, :name, :colour, :ord)"
                ),
                {"pid": str(project_id), "slug": slug, "name": name, "colour": colour, "ord": order},
            )

    # 3. Change status columns from ENUM → VARCHAR
    for table in ("projects", "stories", "tasks"):
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN status TYPE VARCHAR(100) USING status::text"
        )
    op.execute(
        "ALTER TABLE status_history ALTER COLUMN from_status "
        "TYPE VARCHAR(100) USING from_status::text"
    )
    op.execute(
        "ALTER TABLE status_history ALTER COLUMN to_status "
        "TYPE VARCHAR(100) USING to_status::text"
    )

    # 4. Drop the old PG enum type
    sa.Enum(name="statusenum").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported — status column type change is irreversible")
