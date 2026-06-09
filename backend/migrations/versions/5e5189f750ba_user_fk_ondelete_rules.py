"""user fk ondelete rules

Revision ID: 5e5189f750ba
Revises: 6fde6f841cd3
Create Date: 2026-06-08 22:15:22.734982

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5e5189f750ba"
down_revision: str | Sequence[str] | None = "6fde6f841cd3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (constraint_name, table, column, ondelete)
# NOT NULL ownership/authorship columns -> CASCADE (delete the row with the user)
# Nullable reference columns           -> SET NULL (keep the row, clear the user)
_FKS = [
    ("comments_author_id_fkey", "comments", "author_id", "CASCADE"),
    ("invitations_inviter_id_fkey", "invitations", "inviter_id", "CASCADE"),
    ("projects_created_by_fkey", "projects", "created_by", "CASCADE"),
    ("projects_owner_id_fkey", "projects", "owner_id", "CASCADE"),
    ("sprints_created_by_fkey", "sprints", "created_by", "CASCADE"),
    ("status_history_changed_by_fkey", "status_history", "changed_by", "CASCADE"),
    ("stories_created_by_fkey", "stories", "created_by", "CASCADE"),
    ("tasks_created_by_fkey", "tasks", "created_by", "CASCADE"),
    ("projects_updated_by_fkey", "projects", "updated_by", "SET NULL"),
    ("stories_updated_by_fkey", "stories", "updated_by", "SET NULL"),
    ("tasks_assignee_id_fkey", "tasks", "assignee_id", "SET NULL"),
    ("tasks_updated_by_fkey", "tasks", "updated_by", "SET NULL"),
]


def upgrade() -> None:
    """Recreate each user FK with an explicit ON DELETE rule."""
    for name, table, column, ondelete in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "users", [column], ["id"], ondelete=ondelete)


def downgrade() -> None:
    """Restore the original FKs with no ON DELETE rule (NO ACTION)."""
    for name, table, column, _ondelete in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "users", [column], ["id"])
