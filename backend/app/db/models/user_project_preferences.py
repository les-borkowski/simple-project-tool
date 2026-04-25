import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base, TimestampMixin


class UserProjectPreferences(TimestampMixin, Base):
    __tablename__ = "user_project_preferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    tab_order: Mapped[list] = mapped_column(
        JSON, nullable=False, default=lambda: ["board", "stories", "sprints", "timeline", "members"]
    )
    hidden_tabs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    __table_args__ = (UniqueConstraint("user_id", "project_id", name="uq_user_project_preferences"),)
