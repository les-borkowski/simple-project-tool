"""initial schema

Revision ID: c393321d07db
Revises:
Create Date: 2026-04-11 14:25:08.860348

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c393321d07db"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables and enum types for the initial schema."""

    # --- Enum types ---
    statusenum = postgresql.ENUM(
        "to_do",
        "in_progress",
        "in_review",
        "in_testing",
        "done",
        name="statusenum",
    )
    priorityenum = postgresql.ENUM(
        "low",
        "medium",
        "high",
        name="priorityenum",
    )
    roleenum = postgresql.ENUM(
        "manager",
        "contributor",
        name="roleenum",
    )
    themeenum = postgresql.ENUM(
        "light",
        "dark",
        "system",
        name="themeenum",
    )
    localeenum = postgresql.ENUM(
        "en-GB",
        "pl",
        name="localeenum",
    )
    invitationstatusenum = postgresql.ENUM(
        "pending",
        "accepted",
        "declined",
        "expired",
        name="invitationstatusenum",
    )

    statusenum.create(op.get_bind(), checkfirst=True)
    priorityenum.create(op.get_bind(), checkfirst=True)
    roleenum.create(op.get_bind(), checkfirst=True)
    themeenum.create(op.get_bind(), checkfirst=True)
    localeenum.create(op.get_bind(), checkfirst=True)
    invitationstatusenum.create(op.get_bind(), checkfirst=True)

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "manager",
                "contributor",
                name="roleenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # --- user_configs ---
    op.create_table(
        "user_configs",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "theme",
            sa.Enum(
                "light",
                "dark",
                "system",
                name="themeenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "locale",
            sa.Enum(
                "en-GB",
                "pl",
                name="localeenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "display_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    # --- projects ---
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "to_do",
                "in_progress",
                "in_review",
                "in_testing",
                "done",
                name="statusenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.Enum(
                "low",
                "medium",
                "high",
                name="priorityenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- project_members ---
    op.create_table(
        "project_members",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "manager",
                "contributor",
                name="roleenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id", "user_id", name="pk_project_member"),
    )

    # --- stories ---
    op.create_table(
        "stories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "to_do",
                "in_progress",
                "in_review",
                "in_testing",
                "done",
                name="statusenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.Enum(
                "low",
                "medium",
                "high",
                name="priorityenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_story_project_status", "stories", ["project_id", "status"]
    )

    # --- tasks ---
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("story_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "to_do",
                "in_progress",
                "in_review",
                "in_testing",
                "done",
                name="statusenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "priority",
            sa.Enum(
                "low",
                "medium",
                "high",
                name="priorityenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_assignee_id", "tasks", ["assignee_id"])
    op.create_index("ix_task_story_status", "tasks", ["story_id", "status"])

    # --- comments ---
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("story_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "num_nonnulls(project_id, story_id, task_id) = 1",
            name="ck_comment_single_parent",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- status_history ---
    op.create_table(
        "status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("story_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "from_status",
            sa.Enum(
                "to_do",
                "in_progress",
                "in_review",
                "in_testing",
                "done",
                name="statusenum",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            sa.Enum(
                "to_do",
                "in_progress",
                "in_review",
                "in_testing",
                "done",
                name="statusenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "changed_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "num_nonnulls(project_id, story_id, task_id) = 1",
            name="ck_status_history_single_parent",
        ),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sh_project_changed_at", "status_history", ["project_id", "changed_at"]
    )
    op.create_index(
        "ix_sh_story_changed_at", "status_history", ["story_id", "changed_at"]
    )
    op.create_index(
        "ix_sh_task_changed_at", "status_history", ["task_id", "changed_at"]
    )

    # --- invitations ---
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inviter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invitee_email", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "manager",
                "contributor",
                name="roleenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "accepted",
                "declined",
                "expired",
                name="invitationstatusenum",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_invitation_email_status",
        "invitations",
        ["invitee_email", "status"],
    )
    op.create_index("ix_invitation_project_id", "invitations", ["project_id"])

    # --- api_keys ---
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column(
            "scopes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_api_key_user_revoked", "api_keys", ["user_id", "revoked_at"]
    )


def downgrade() -> None:
    """Drop all tables and enum types."""

    # Drop tables in reverse dependency order
    op.drop_index("ix_api_key_user_revoked", table_name="api_keys")
    op.drop_table("api_keys")

    op.drop_index("ix_invitation_project_id", table_name="invitations")
    op.drop_index("ix_invitation_email_status", table_name="invitations")
    op.drop_table("invitations")

    op.drop_index("ix_sh_task_changed_at", table_name="status_history")
    op.drop_index("ix_sh_story_changed_at", table_name="status_history")
    op.drop_index("ix_sh_project_changed_at", table_name="status_history")
    op.drop_table("status_history")

    op.drop_table("comments")

    op.drop_index("ix_task_story_status", table_name="tasks")
    op.drop_index("ix_task_assignee_id", table_name="tasks")
    op.drop_table("tasks")

    op.drop_index("ix_story_project_status", table_name="stories")
    op.drop_table("stories")

    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_table("user_configs")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    # Drop enum types
    sa.Enum(name="invitationstatusenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="localeenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="themeenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="roleenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="priorityenum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="statusenum").drop(op.get_bind(), checkfirst=True)
